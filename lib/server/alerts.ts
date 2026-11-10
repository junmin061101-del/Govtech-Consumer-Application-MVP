// 빈자리 알림: 등록(계정당 활성 3개·90일), 매일 매칭(알림당 하루 1회), 만료 안내, 발송 3일 뒤 원탭 응답.
import { VACANCY_RESPONSES } from "@/lib/events";
import { coversHours } from "@/lib/filter";
import { KIND_ORDER } from "@/lib/kinds";
import type { Day, Facility, FacilityKind } from "@/lib/types";
import { logDemandEvent } from "./events";
import { facilityById, type FacilityChange } from "./facilities";
import { HttpError } from "./http";
import { notify, NOTIFICATIONS, type AppNotification } from "./notify";
import { isKnownDong } from "./regions";
import { newId, store } from "./store";

export const ALERTS = "vacancy_alerts";
export const DELIVERIES = "alert_deliveries";
export const MAX_ACTIVE_ALERTS = 3;
export const ALERT_DAYS = 90;
export const RENEW_NOTICE_DAYS = 7;
export const FOLLOWUP_DAYS = 3;
const DAY_MS = 86_400_000;

export const CHECK_NOTICE = "자리 여부는 시설에 꼭 확인해 주세요.";

export type AlertTarget =
  | { type: "facility"; facilityId: string; facilityName: string }
  | { type: "condition"; emdCode: string; day: Day; start: string; end: string; age: number | null; kinds: FacilityKind[] };

export interface VacancyAlert {
  uid: string;
  target: AlertTarget;
  status: "active" | "cancelled" | "expired";
  created_at: string;
  expires_at: string;
  /** 마지막 발송일 (KST YYYY-MM-DD). 같은 알림은 하루 1회까지 */
  last_sent_on: string | null;
  renew_notice_at: string | null;
  [k: string]: unknown;
}

export interface Delivery {
  uid: string;
  alert_id: string;
  facility_ids: string[];
  emd_code: string | null;
  sent_at: string;
  followup_at: string | null;
  response: string | null;
  [k: string]: unknown;
}

/** KST 날짜 */
export const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateTarget(t: AlertTarget): AlertTarget {
  if (t?.type === "facility") {
    if (typeof t.facilityId !== "string" || !t.facilityId || t.facilityId.length > 64) throw new HttpError(400, "시설을 골라 주세요");
    return { type: "facility", facilityId: t.facilityId, facilityName: String(t.facilityName ?? "").slice(0, 60) };
  }
  if (t?.type === "condition") {
    if (!isKnownDong(t.emdCode)) throw new HttpError(400, "행정동을 골라 주세요");
    if (!["weekday", "sat", "sun"].includes(t.day) || !HHMM.test(t.start) || !HHMM.test(t.end) || t.end <= t.start) {
      throw new HttpError(400, "시간대를 확인해 주세요");
    }
    const age = t.age === null || (Number.isInteger(t.age) && t.age >= 0 && t.age <= 8) ? t.age : null;
    const kinds = (Array.isArray(t.kinds) ? t.kinds : []).filter((k) => KIND_ORDER.includes(k));
    return { type: "condition", emdCode: t.emdCode, day: t.day, start: t.start, end: t.end, age, kinds };
  }
  throw new HttpError(400, "알림 대상을 확인해 주세요");
}

export async function listAlerts(uid: string) {
  const list = await store().list<VacancyAlert>(ALERTS, [
    ["uid", "==", uid],
    ["status", "==", "active"],
  ]);
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createAlert(uid: string, target: AlertTarget, now = new Date()) {
  const t = validateTarget(target);
  const active = await listAlerts(uid);
  if (active.length >= MAX_ACTIVE_ALERTS) {
    throw new HttpError(409, `빈자리 알림은 ${MAX_ACTIVE_ALERTS}개까지 받을 수 있어요. 기존 알림을 해지해 주세요`);
  }
  const dup = active.find((a) => JSON.stringify(a.target) === JSON.stringify(t));
  if (dup) throw new HttpError(409, "이미 같은 알림을 받고 있어요");

  const id = newId();
  const alert: VacancyAlert = {
    uid,
    target: t,
    status: "active",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ALERT_DAYS * DAY_MS).toISOString(),
    last_sent_on: null,
    renew_notice_at: null,
  };
  await store().set(ALERTS, id, alert);

  const facility = t.type === "facility" ? await facilityById(t.facilityId) : null;
  await logDemandEvent(
    uid,
    {
      event_type: "vacancy_register",
      emd_code: t.type === "condition" ? t.emdCode : (facility?.emdCode ?? null),
      ...(t.type === "condition" ? { day: t.day, start: t.start, end: t.end, age: t.age, facility_types: t.kinds } : {}),
      ...(facility ? { facility_types: [facility.kind] } : {}),
      meta: { target_type: t.type },
    },
    now,
  );
  return { id, ...alert };
}

async function ownAlert(uid: string, id: string) {
  const a = await store().get<VacancyAlert>(ALERTS, id);
  if (!a || a.uid !== uid) throw new HttpError(404, "알림을 찾을 수 없어요");
  return a;
}

export async function cancelAlert(uid: string, id: string) {
  const a = await ownAlert(uid, id);
  await store().set(ALERTS, id, { ...a, status: "cancelled" });
}

export async function extendAlert(uid: string, id: string, now = new Date()) {
  const a = await ownAlert(uid, id);
  if (a.status !== "active") throw new HttpError(400, "이미 끝난 알림이에요");
  const next = { ...a, expires_at: new Date(now.getTime() + ALERT_DAYS * DAY_MS).toISOString(), renew_notice_at: null };
  await store().set(ALERTS, id, next);
  return { id, ...next };
}

/** 조건형 알림이 이 시설과 맞는지 */
export function conditionMatches(t: Extract<AlertTarget, { type: "condition" }>, f: Facility): boolean {
  if (f.emdCode !== t.emdCode) return false;
  if (t.kinds.length > 0 && !t.kinds.includes(f.kind)) return false;
  if (t.age !== null && !f.ageOpen[t.age]) return false;
  return coversHours(f, t) !== null;
}

/** 빈자리가 새로 생기거나 늘어난 변화만 */
export const isOpening = (c: FacilityChange) =>
  c.vacancy !== null && c.vacancy > 0 && c.prevVacancy !== null && c.vacancy > c.prevVacancy;

export interface JobReport {
  expired: number;
  renewNotices: number;
  sent: number;
  followups: number;
}

export async function runAlertJob(changes: FacilityChange[], now = new Date()): Promise<JobReport> {
  const s = store();
  const report: JobReport = { expired: 0, renewNotices: 0, sent: 0, followups: 0 };
  const today = kstDate(now);

  const opened: Facility[] = [];
  for (const c of changes.filter(isOpening)) {
    const f = await facilityById(c.id);
    if (f) opened.push(f);
  }

  for (const a of await s.list<VacancyAlert>(ALERTS, [["status", "==", "active"]])) {
    const { id, ...alert } = a;
    const expiresAt = Date.parse(alert.expires_at);

    if (expiresAt <= now.getTime()) {
      await s.set(ALERTS, id, { ...alert, status: "expired" });
      report.expired++;
      continue;
    }

    let next = alert;
    if (!alert.renew_notice_at && expiresAt - now.getTime() <= RENEW_NOTICE_DAYS * DAY_MS) {
      await notify(alert.uid, "alert_expiring", {
        title: "빈자리 알림이 곧 끝나요",
        body: `${describeTarget(alert.target)} 알림이 ${kstDate(new Date(expiresAt))}에 끝나요. 계속 받으려면 내 정보에서 연장해 주세요.`,
        link: "/me#alerts",
      });
      next = { ...next, renew_notice_at: now.toISOString() };
      report.renewNotices++;
    }

    const t = alert.target;
    const hits = opened.filter((f) => (t.type === "facility" ? f.id === t.facilityId : conditionMatches(t, f)));
    if (hits.length > 0 && alert.last_sent_on !== today) {
      const names = hits.slice(0, 2).map((f) => f.name).join(", ");
      const more = hits.length > 2 ? ` 외 ${hits.length - 2}곳` : "";
      const deliveryId = newId();
      const delivery: Delivery = {
        uid: alert.uid,
        alert_id: id,
        facility_ids: hits.map((f) => f.id),
        emd_code: t.type === "condition" ? t.emdCode : (hits[0].emdCode ?? null),
        sent_at: now.toISOString(),
        followup_at: null,
        response: null,
      };
      await s.set(DELIVERIES, deliveryId, delivery);
      await notify(alert.uid, "vacancy", {
        title: "자리가 생겼을 수 있어요",
        body: `${names}${more}의 정원·현원 공개자료에 여유가 생겼어요. 공개자료 기준 추정이니 ${CHECK_NOTICE}`,
        link: "/",
      });
      next = { ...next, last_sent_on: today };
      report.sent++;
    }
    if (next !== alert) await s.set(ALERTS, id, next);
  }

  // 발송 3일 뒤 원탭 응답 요청
  const due = await s.list<Delivery>(DELIVERIES, [
    ["followup_at", "==", null],
    ["sent_at", "<=", new Date(now.getTime() - FOLLOWUP_DAYS * DAY_MS).toISOString()],
  ]);
  for (const d of due) {
    const { id, ...rest } = d;
    await notify(
      d.uid,
      "vacancy_followup",
      { title: "알려 드린 자리, 어떻게 됐나요?", body: "한 번만 눌러 알려 주시면 다음 알림을 더 정확하게 만들 수 있어요." },
      { actions: VACANCY_RESPONSES.map((r) => ({ id: r.id, label: r.label })), ref: id },
    );
    await s.set(DELIVERIES, id, { ...rest, followup_at: now.toISOString() });
    report.followups++;
  }
  return report;
}

/** 알림함의 원탭 응답 → vacancy_resolved */
export async function respondToNotification(uid: string, notificationId: string, response: string, now = new Date()) {
  if (!VACANCY_RESPONSES.some((r) => r.id === response)) throw new HttpError(400, "응답을 골라 주세요");
  const s = store();
  const n = await s.get<AppNotification>(NOTIFICATIONS, notificationId);
  if (!n || n.uid !== uid || n.kind !== "vacancy_followup" || !n.ref) throw new HttpError(404, "알림을 찾을 수 없어요");
  if (n.answered) throw new HttpError(409, "이미 응답했어요");
  const d = await s.get<Delivery>(DELIVERIES, n.ref);
  if (d) await s.set(DELIVERIES, n.ref, { ...d, response });
  await s.set(NOTIFICATIONS, notificationId, { ...n, answered: response, read_at: n.read_at ?? now.toISOString() });
  await logDemandEvent(uid, { event_type: "vacancy_resolved", emd_code: d?.emd_code ?? null, meta: { response } }, now);
}

const DAY_LABEL: Record<Day, string> = { weekday: "평일", sat: "토요일", sun: "일요일" };

export function describeTarget(t: AlertTarget): string {
  if (t.type === "facility") return t.facilityName || "선택한 시설";
  return `${DAY_LABEL[t.day]} ${t.start}~${t.end}${t.age !== null ? ` · 만 ${t.age}세` : ""} 조건`;
}
