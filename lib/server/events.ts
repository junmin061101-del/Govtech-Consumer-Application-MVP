// 수요 이벤트 쓰기. 모든 이벤트는 여기 logDemandEvent 한 곳으로만 저장된다 (클라이언트 직접 쓰기 없음).
// 저장 문서에는 uid 원문·이름·연락처·좌표를 넣지 않는다. 위치는 행정동 코드만 남긴다.
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  APPLY_EXIT_REASONS,
  EVENT_TYPES,
  targetFor,
  timeSlotsFor,
  VACANCY_RESPONSES,
  WIDEN_DIMENSIONS,
  type DemandEventInput,
  type EventType,
  type Target,
  type TimeSlot,
} from "@/lib/events";
import { KIND_ORDER } from "@/lib/kinds";
import type { FacilityKind } from "@/lib/types";
import { coordToDong, isKnownDong } from "./regions";
import { pkeySecret } from "./secrets";
import { newId, store } from "./store";

export const EVENTS = "demand_events";
const DEDUP = "demand_event_dedup";
/** 회원별 가명 키 솔트. 탈퇴 시 지우면 기존 이벤트를 그 회원과 다시 연결할 방법이 없어진다. */
export const PKEY_SALTS = "pkey_salts";
const DEDUP_WINDOW_MS = 24 * 3600 * 1000;

export interface DemandEvent {
  event_type: EventType;
  emd_code: string | null;
  time_slot: TimeSlot[];
  target: Target | null;
  facility_types: FacilityKind[];
  pkey: string;
  dedup_key: string;
  /** 같은 dedup_key 가 24시간 안에 다시 들어온 횟수 */
  repeat_count: number;
  created_at: string;
  last_seen_at: string;
  meta: Record<string, string | number | boolean>;
  [k: string]: unknown;
}

/** 저장 문서에 허용되는 필드 (테스트에서 개인정보가 섞이지 않았는지 확인한다) */
export const EVENT_FIELDS = [
  "event_type",
  "emd_code",
  "time_slot",
  "target",
  "facility_types",
  "pkey",
  "dedup_key",
  "repeat_count",
  "created_at",
  "last_seen_at",
  "meta",
] as const;

const ids = <T extends readonly { id: string }[]>(xs: T) => xs.map((x) => x.id) as string[];
const int = (min: number, max: number) => (v: unknown) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined;
const oneOf = (allowed: readonly string[]) => (v: unknown) =>
  typeof v === "string" && allowed.includes(v) ? v : undefined;
const shortText = (v: unknown) => (typeof v === "string" && /^[\w가-힣·:~.\- ]{1,24}$/.test(v) ? v : undefined);

/** 이벤트 종류별로 meta 에 허용하는 키와 값. 자유 텍스트는 받지 않는다. */
const META_RULES: Record<EventType, Record<string, (v: unknown) => string | number | undefined>> = {
  search_result: { result_count: int(0, 10000), combo_count: int(0, 3), walk_min: int(0, 120) },
  search_no_result: { walk_min: int(0, 120), combo_count: int(0, 3) },
  search_widened: { dimension: oneOf(WIDEN_DIMENSIONS), from: shortText, to: shortText },
  apply_step: { step: int(1, 6) },
  apply_exit: { step: int(1, 6), reason: oneOf(ids(APPLY_EXIT_REASONS)) },
  apply_complete: { priority_count: int(0, 50) },
  vacancy_register: { target_type: oneOf(["facility", "condition"]) },
  vacancy_resolved: { response: oneOf(ids(VACANCY_RESPONSES)) },
  community_need: { category: oneOf(["need_care"]) },
};

function cleanMeta(type: EventType, meta: unknown) {
  const out: Record<string, string | number> = {};
  if (!meta || typeof meta !== "object") return out;
  for (const [k, check] of Object.entries(META_RULES[type])) {
    const v = check((meta as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** uid → 가명 키. 회원별 솔트가 없으면 만든다. */
export async function pkeyFor(uid: string): Promise<string> {
  let salt = (await store().get<{ salt: string }>(PKEY_SALTS, uid))?.salt;
  if (!salt) {
    salt = randomBytes(16).toString("base64url");
    await store().set(PKEY_SALTS, uid, { salt });
  }
  return createHmac("sha256", pkeySecret()).update(`${uid}:${salt}`).digest("base64url").slice(0, 32);
}

export interface LogResult {
  id: string;
  deduped: boolean;
}

export async function logDemandEvent(uid: string, input: DemandEventInput, now = new Date()): Promise<LogResult> {
  if (!(EVENT_TYPES as readonly string[]).includes(input?.event_type)) throw new Error("unknown event_type");
  const type = input.event_type;

  // 위치: 행정동 코드를 직접 받거나, 좌표를 받아 서버에서 변환한 뒤 좌표는 버린다
  let emd: string | null = null;
  if (typeof input.emd_code === "string" && isKnownDong(input.emd_code)) emd = input.emd_code;
  else if (input.center) emd = coordToDong(Number(input.center.lat), Number(input.center.lng))?.emdCode ?? null;

  const slots =
    input.day && ["weekday", "sat", "sun"].includes(input.day) && HHMM.test(input.start ?? "") && HHMM.test(input.end ?? "")
      ? timeSlotsFor(input.day, input.start!, input.end!)
      : [];
  const age = Number.isInteger(input.age) && input.age! >= 0 && input.age! <= 8 ? input.age! : null;
  const kinds = (Array.isArray(input.facility_types) ? input.facility_types : [])
    .filter((k): k is FacilityKind => (KIND_ORDER as string[]).includes(k))
    .sort();
  const meta = cleanMeta(type, input.meta);

  const pkey = await pkeyFor(uid);
  const dedupKey = createHash("sha256")
    .update(JSON.stringify([pkey, type, emd, slots, targetFor(age), [...new Set(kinds)], meta]))
    .digest("base64url")
    .slice(0, 32);

  const nowIso = now.toISOString();
  const prev = await store().get<{ event_id: string; at: string }>(DEDUP, dedupKey);
  if (prev && now.getTime() - Date.parse(prev.at) < DEDUP_WINDOW_MS) {
    const ev = await store().get<DemandEvent>(EVENTS, prev.event_id);
    if (ev) {
      await store().set(EVENTS, prev.event_id, { ...ev, repeat_count: ev.repeat_count + 1, last_seen_at: nowIso });
      return { id: prev.event_id, deduped: true };
    }
  }

  const id = newId();
  const doc: DemandEvent = {
    event_type: type,
    emd_code: emd,
    time_slot: slots,
    target: targetFor(age),
    facility_types: [...new Set(kinds)],
    pkey,
    dedup_key: dedupKey,
    repeat_count: 0,
    created_at: nowIso,
    last_seen_at: nowIso,
    meta,
  };
  await store().set(EVENTS, id, doc);
  await store().set(DEDUP, dedupKey, { event_id: id, at: nowIso });
  return { id, deduped: false };
}
