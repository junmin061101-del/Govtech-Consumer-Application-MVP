// 서울 열린데이터광장 '서울시 유치원 일반현황' (SERVICE=childSchoolInfo, 서울 전체, 유치원알리미 공시 자료).
// 좌표가 없어 주소를 카카오 로컬 API(주소 검색, 서버 키 KAKAO_REST_API_KEY)로 좌표로 바꾸고, 결과는 Firestore(geocodes)에
// 주소별로 저장해 다음 수집부터는 새 주소만 묻는다. 정원 항목이 없어 빈자리는 알 수 없다(null). 현원은 만 3~5세·혼합·특수반 원아 수 합.
import { createHash } from "node:crypto";
import { AGES, type Facility } from "@/lib/types";
import type { FacilitySource, SourceRun } from "./index";
import { store } from "../store";
import { fetchAll } from "./seoulChildcare";

export interface KindergartenRow {
  KDGT_CD?: string;
  KDGT_NM?: string;
  FNDN_TYPE?: string;
  ADDR?: string;
  TELNO?: string;
  HMPG?: string;
  OPER_HR?: string;
  AGE_3_CLAS_CNT?: string | number;
  AGE_4_CLAS_CNT?: string | number;
  AGE_5_CLAS_CNT?: string | number;
  MIX_CLAS_CNT?: string | number;
  AGE_3_TDL_CNT?: string | number;
  AGE_4_TDL_CNT?: string | number;
  AGE_5_TDL_CNT?: string | number;
  MIX_TDL_CNT?: string | number;
  SPCL_TDL_CNT?: string | number;
  /** 공시 주기 (예: 20262 = 2026년 2차) */
  PBLNT_CYCL?: string;
}

/** 이 공시 주기보다 오래된 행은 폐원 등으로 공시가 끊긴 곳으로 보고 뺀다 */
export const MIN_CYCLE = "20251";
const GEOCODES = "geocodes";
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** "07시30분~19시30분" → { open: "07:30", close: "19:30" } */
export function parseOperHours(s: string | undefined): { open: string; close: string } | null {
  const m = String(s ?? "").match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?\s*[~\-]\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  if (!m) return null;
  const t = (h: string, mm?: string) => `${h.padStart(2, "0")}:${(mm ?? "0").padStart(2, "0")}`;
  const open = t(m[1], m[2]);
  const close = t(m[3], m[4]);
  return open < close && Number(m[3]) <= 24 ? { open, close } : null;
}

export function normalizeKindergarten(r: KindergartenRow, at: { lat: number; lng: number }): Facility | null {
  if (!r.KDGT_CD || !r.KDGT_NM) return null;
  const mix = n(r.MIX_CLAS_CNT) > 0;
  const cls = [n(r.AGE_3_CLAS_CNT), n(r.AGE_4_CLAS_CNT), n(r.AGE_5_CLAS_CNT)];
  const anyClass = mix || cls.some((c) => c > 0);
  // 반 정보가 비어 있으면 만 3~5세 전체로 본다
  const ageOpen = AGES.map((a) => a >= 3 && a <= 5 && (!anyClass || mix || cls[a - 3] > 0));
  const enrolled = n(r.AGE_3_TDL_CNT) + n(r.AGE_4_TDL_CNT) + n(r.AGE_5_TDL_CNT) + n(r.MIX_TDL_CNT) + n(r.SPCL_TDL_CNT);
  const weekday = parseOperHours(r.OPER_HR);
  const home = (r.HMPG ?? "").trim();
  return {
    id: `kg:${r.KDGT_CD}`,
    kind: "kindergarten",
    name: r.KDGT_NM.trim(),
    type: (r.FNDN_TYPE ?? "유치원").trim(),
    address: (r.ADDR ?? "").trim(),
    phone: (r.TELNO ?? "").trim(),
    homepage: /^https?:\/\//i.test(home) ? home : "",
    lat: at.lat,
    lng: at.lng,
    capacity: null,
    enrolled: enrolled > 0 ? enrolled : null,
    vacancy: null,
    ageOpen,
    extended: {},
    hours: weekday ? { weekday } : undefined,
    asOf: "",
    source: "seoul-kindergarten",
  };
}

export type Geocoder = (address: string) => Promise<{ lat: number; lng: number } | null>;

/** 카카오 로컬 주소 검색 */
export function kakaoGeocoder(key: string, f: typeof fetch = fetch): Geocoder {
  return async (address) => {
    const q = new URLSearchParams({ query: address });
    const res = await f(`https://dapi.kakao.com/v2/local/search/address.json?${q}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`kakao ${res.status}`);
    const d = (await res.json()) as { documents?: { x: string; y: string }[] };
    const doc = d.documents?.[0];
    return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
  };
}

/** 주소 → 좌표. 저장된 결과를 먼저 쓰고, 없는 것만 묻는다 (동시 8건) */
export async function geocodeAll(addresses: string[], geocode: Geocoder): Promise<Map<string, { lat: number; lng: number } | null>> {
  const out = new Map<string, { lat: number; lng: number } | null>();
  const id = (a: string) => createHash("sha1").update(a).digest("hex");
  const todo: string[] = [];
  for (const a of new Set(addresses)) {
    const hit = await store().get<{ lat: number | null; lng: number | null }>(GEOCODES, id(a));
    if (hit) out.set(a, hit.lat !== null && hit.lng !== null ? { lat: hit.lat, lng: hit.lng } : null);
    else todo.push(a);
  }
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, todo.length) }, async () => {
      while (i < todo.length) {
        const a = todo[i++];
        try {
          const p = await geocode(a);
          out.set(a, p);
          // 못 찾은 주소도 저장해 매일 다시 묻지 않는다 (주소가 바뀌면 새 키가 된다)
          await store().set(GEOCODES, id(a), { address: a, lat: p?.lat ?? null, lng: p?.lng ?? null, at: new Date().toISOString() });
        } catch {
          out.set(a, null); // 일시 오류는 저장하지 않고 다음 수집에서 다시 묻는다
        }
      }
    }),
  );
  return out;
}

export function seoulKindergartenSource(geocoder?: Geocoder): FacilitySource {
  return {
    id: "seoul-kindergarten",
    kind: "kindergarten",
    label: "서울 유치원",
    async run(): Promise<SourceRun> {
      const key = process.env.SEOUL_OPEN_API_KEY?.trim();
      const kakao = process.env.KAKAO_REST_API_KEY?.trim();
      const geocode = geocoder ?? (kakao ? kakaoGeocoder(kakao) : null);
      if (!key || !geocode) {
        return { facilities: [], parts: [{ key: "seoul-kindergarten", count: 0, skipped: !key ? "SEOUL_OPEN_API_KEY 없음" : "KAKAO_REST_API_KEY 없음" }], partial: true };
      }
      try {
        const rows = ((await fetchAll(key, "childSchoolInfo", false)) as KindergartenRow[]).filter(
          (r) => String(r.PBLNT_CYCL ?? "") >= MIN_CYCLE && (r.ADDR ?? "").trim(),
        );
        const coords = await geocodeAll(rows.map((r) => r.ADDR!.trim()), geocode);
        const list: Facility[] = [];
        let missing = 0;
        for (const r of rows) {
          const at = coords.get(r.ADDR!.trim());
          const f = at ? normalizeKindergarten(r, at) : null;
          if (f) list.push(f);
          else missing++;
        }
        const parts: SourceRun["parts"] = [{ key: "seoul", count: list.length }];
        if (missing) parts.push({ key: "좌표 못 찾음", count: missing });
        // 좌표를 못 찾은 곳이 있으면 그 시설이 지워지지 않도록 정리(complete)는 하지 않는다
        return { facilities: list, parts, partial: false, complete: missing === 0 };
      } catch (e) {
        return { facilities: [], parts: [{ key: "seoul-kindergarten", count: 0, error: e instanceof Error ? e.message : "unknown" }], partial: true };
      }
    },
  };
}

export const seoulKindergarten = seoulKindergartenSource();
