import type { Facility, Filters, Match } from "./types";

/** 어린이집 기본 보육시간(영유아보육법 시행규칙: 07:30~19:30, 평일). */
export const BASE_OPEN = "07:30";
export const BASE_CLOSE = "19:30";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 요청 시간대를 시설이 커버하는지 판정한다.
 * - 평일 기본 보육시간 안이면 규정상 운영시간이므로 '확인됨'.
 * - 그 밖(야간·주말)은 보강 데이터에 명시된 시설만 통과. 데이터가 없으면 제외한다.
 */
export function coversHours(f: Facility, filters: Pick<Filters, "day" | "start" | "end">): Match["hours"] | null {
  const s = toMin(filters.start);
  const e = toMin(filters.end);
  if (e <= s) return null;

  if (filters.day === "weekday") {
    if (s >= toMin(BASE_OPEN) && e <= toMin(BASE_CLOSE)) {
      return { label: `기본 보육시간 (${BASE_OPEN}~${BASE_CLOSE})`, confidence: "confirmed" };
    }
    if (f.extended.night && e <= toMin(f.extended.closeTime ?? "23:59")) {
      return { label: `야간연장 운영 (~${f.extended.closeTime ?? "심야"})`, confidence: "confirmed" };
    }
    return null;
  }

  if (f.extended.weekend) {
    return { label: `${filters.day === "sat" ? "토요일" : "일요일"} 운영`, confidence: "confirmed" };
  }
  return null;
}

export function matchFacilities(all: Facility[], filters: Filters): Match[] {
  const out: Match[] = [];
  for (const facility of all) {
    if (facility.vacancy <= 0) continue;
    if (filters.age !== null && !facility.ageOpen[filters.age]) continue;

    const hours = coversHours(facility, filters);
    if (!hours) continue;

    let distanceM: number | null = null;
    if (filters.center) {
      distanceM = haversineM(filters.center, facility);
      if (distanceM > filters.radiusM) continue;
    }
    out.push({ facility, distanceM, hours });
  }
  // 가까운 순, 위치 미지정이면 빈자리 많은 순
  out.sort((a, b) =>
    a.distanceM !== null && b.distanceM !== null
      ? a.distanceM - b.distanceM
      : b.facility.vacancy - a.facility.vacancy,
  );
  return out;
}

/** 도보 분 → 미터 (성인 평균 약 67m/분) */
export const walkMinToM = (min: number) => Math.round(min * 67);
