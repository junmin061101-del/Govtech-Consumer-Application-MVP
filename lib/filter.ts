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
 * - 어린이집: 평일 기본 보육시간 안이면 '확인됨'. 야간·주말은 야간연장형·휴일보육 시설만.
 * - 유치원·지역아동센터·다함께돌봄센터: 운영시간 데이터가 없으므로 평일 19:30 이전 요청만
 *   '확인 필요'로 통과시키고, 야간·주말 요청은 제외한다.
 */
export function coversHours(f: Facility, filters: Pick<Filters, "day" | "start" | "end">): Match["hours"] | null {
  const s = toMin(filters.start);
  const e = toMin(filters.end);
  if (e <= s) return null;

  if (f.kind !== "daycare") {
    if (filters.day === "weekday" && e <= toMin(BASE_CLOSE)) {
      return { label: "평일 운영 · 운영 시간은 시설에 확인", confidence: "needs-check" };
    }
    return null;
  }

  if (filters.day === "weekday") {
    if (s >= toMin(BASE_OPEN) && e <= toMin(BASE_CLOSE)) {
      return { label: `기본 보육시간 (${BASE_OPEN}~${BASE_CLOSE})`, confidence: "confirmed" };
    }
    if (f.extended.night) {
      // 종료 시각을 아는 경우만 요청 시간과 비교. 모르면 야간연장형이라는 사실만 알려주고 확인을 안내한다.
      if (f.extended.closeTime) {
        return e <= toMin(f.extended.closeTime)
          ? { label: `야간연장 운영 (~${f.extended.closeTime})`, confidence: "confirmed" }
          : null;
      }
      return { label: "야간연장형 · 종료 시각은 시설에 확인", confidence: "needs-check" };
    }
    return null;
  }

  if (f.extended.weekend) {
    return { label: "휴일보육 운영 · 운영 시간은 시설에 확인", confidence: "needs-check" };
  }
  return null;
}

export function matchFacilities(all: Facility[], filters: Filters): Match[] {
  const out: Match[] = [];
  for (const facility of all) {
    if (filters.kinds.length > 0 && !filters.kinds.includes(facility.kind)) continue;
    // 빈자리가 0으로 확인된 곳만 제외. 빈자리 정보가 없는 시설(null)은 지도에 남긴다.
    if (facility.vacancy !== null && facility.vacancy <= 0) continue;
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
  // 가까운 순, 위치 미지정이면 빈자리를 아는 곳 먼저(많은 순)
  out.sort((a, b) =>
    a.distanceM !== null && b.distanceM !== null
      ? a.distanceM - b.distanceM
      : (b.facility.vacancy ?? -1) - (a.facility.vacancy ?? -1),
  );
  return out;
}

/** 도보 분 → 미터 (성인 평균 약 67m/분) */
export const walkMinToM = (min: number) => Math.round(min * 67);
