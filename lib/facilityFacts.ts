// 시설 정보를 표(상세·비교)로 보여 줄 때 쓰는 항목. 아이사랑 '정보 더보기'처럼 유형·특성·정원/현원·운영시간을 한 줄씩.
import { KIND_META } from "./kinds";
import { availability } from "./status";
import type { Facility, Match } from "./types";

export const MAX_COMPARE = 3;

export const fmtDist = (m: number | null) =>
  m === null ? null : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;

/** 운영 특성: 야간연장·휴일보육·토요일 운영 등 */
export function features(f: Facility): string[] {
  const out: string[] = [];
  if (f.extended.night) out.push(f.extended.closeTime ? `야간연장(~${f.extended.closeTime})` : "야간연장");
  if (f.hours?.sat) out.push(`토요일 ${f.hours.sat.open}~${f.hours.sat.close}`);
  else if (f.extended.weekend) out.push(f.kind === "daycare" ? "휴일보육" : "주말 운영");
  return out;
}

/** 평일 운영시간 표시 */
export function weekdayHours(f: Facility): string {
  if (f.hours?.weekday) return `${f.hours.weekday.open}~${f.hours.weekday.close}`;
  if (f.kind === "daycare") return f.extended.night && f.extended.closeTime ? `07:30~${f.extended.closeTime}` : "07:30~19:30 (기본 보육시간)";
  return "시설에 확인";
}

export function ageRange(f: Facility): string {
  const open = f.ageOpen.flatMap((v, a) => (v ? [a] : []));
  if (open.length === 0) return `만 ${KIND_META[f.kind].ages[0]}~${KIND_META[f.kind].ages[1]}세`;
  const lo = open[0];
  const hi = open[open.length - 1];
  return lo === hi ? `만 ${lo}세` : `만 ${lo}~${hi}세`;
}

export interface Fact {
  key: string;
  label: string;
  value: string;
}

/** 상세·비교 표의 행. 값이 없으면 '정보 없음' */
export function facts(m: Match): Fact[] {
  const f = m.facility;
  const a = availability(f);
  const capEnr =
    f.capacity !== null && f.enrolled !== null
      ? `정원 ${f.capacity}명 · 현원 ${f.enrolled}명`
      : f.capacity !== null
        ? `정원 ${f.capacity}명`
        : f.enrolled !== null
          ? `현원(원아) ${f.enrolled}명`
          : "정보 없음";
  const waitTotal = f.waitlist ? f.waitlist.reduce((x, y) => x + y, 0) : null;
  return [
    { key: "kind", label: "종류·유형", value: `${KIND_META[f.kind].label}${f.type && f.type !== KIND_META[f.kind].label ? ` · ${f.type}` : ""}` },
    { key: "status", label: "상태", value: a.label },
    { key: "vacancy", label: "빈자리(추정)", value: f.vacancy !== null ? `${f.vacancy}명` : "정보 없음" },
    { key: "capacity", label: "정원 및 현원", value: capEnr },
    { key: "hours", label: "평일 운영", value: weekdayHours(f) },
    { key: "fit", label: "요청 시간대", value: m.hours.label },
    { key: "features", label: "특성", value: features(f).join(" · ") || "-" },
    { key: "ages", label: "대상 연령", value: ageRange(f) },
    { key: "distance", label: "거리", value: fmtDist(m.distanceM) ?? "-" },
    { key: "staff", label: "교직원", value: f.staff != null ? `${f.staff}명` : "정보 없음" },
    { key: "waitlist", label: "입소대기", value: waitTotal !== null ? `${waitTotal}명` : "정보 없음" },
    { key: "phone", label: "전화", value: f.phone || "정보 없음" },
    { key: "asOf", label: "기준일", value: a.asOf ?? "정보 없음" },
  ];
}

/** 비교 표에서 가장 나은 값(빈자리 최다·거리 최단·대기 최소)을 표시할 시설 id */
export function bestIds(ms: Match[]): Partial<Record<string, string>> {
  const pick = (score: (m: Match) => number | null, higher: boolean) => {
    const scored = ms.flatMap((m) => {
      const s = score(m);
      return s === null ? [] : [{ id: m.facility.id, s }];
    });
    if (scored.length < 2) return undefined;
    const best = scored.reduce((x, y) => (higher ? (y.s > x.s ? y : x) : y.s < x.s ? y : x));
    return scored.filter((x) => x.s === best.s).length === 1 ? best.id : undefined;
  };
  return {
    vacancy: pick((m) => m.facility.vacancy, true),
    distance: pick((m) => m.distanceM, false),
    waitlist: pick((m) => (m.facility.waitlist ? m.facility.waitlist.reduce((x, y) => x + y, 0) : null), false),
  };
}
