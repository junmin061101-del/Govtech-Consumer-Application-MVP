// 수요 이벤트 정의. 쓰기는 서버(lib/server/events.ts 의 logDemandEvent) 한 곳에서만 한다.
// 이 파일은 클라이언트·서버가 함께 쓰는 정의와 순수 함수만 둔다.
import type { Day, FacilityKind } from "./types";

export const EVENT_TYPES = [
  "search_result",
  "search_no_result",
  "search_widened",
  "apply_step",
  "apply_exit",
  "apply_complete",
  "vacancy_register",
  "vacancy_resolved",
  "community_need",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** 평일 07–09 / 09–18 / 18–20 / 20–22 / 주말 */
export const TIME_SLOTS = [
  { id: "wd_07_09", from: "07:00", to: "09:00" },
  { id: "wd_09_18", from: "09:00", to: "18:00" },
  { id: "wd_18_20", from: "18:00", to: "20:00" },
  { id: "wd_20_22", from: "20:00", to: "22:00" },
] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number]["id"] | "weekend";

export type Target = "infant" | "school";

export const APPLY_EXIT_REASONS = [
  { id: "docs_complex", label: "서류가 복잡해요" },
  { id: "low_priority", label: "우선순위가 낮아요" },
  { id: "time_mismatch", label: "시간이 안 맞아요" },
  { id: "too_far", label: "너무 멀어요" },
  { id: "found_other", label: "다른 방법을 찾았어요" },
  { id: "other", label: "기타" },
] as const;

export const VACANCY_RESPONSES = [
  { id: "applied", label: "신청했어요" },
  { id: "not_yet", label: "아직이에요" },
  { id: "not_needed", label: "필요 없어요" },
] as const;

export const WIDEN_DIMENSIONS = ["distance", "time", "kind"] as const;
export type WidenDimension = (typeof WIDEN_DIMENSIONS)[number];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** 요청 시간대가 걸치는 통계용 구간. 주말은 하나로 묶는다. 07시 이전·22시 이후만 걸치면 빈 배열. */
export function timeSlotsFor(day: Day, start: string, end: string): TimeSlot[] {
  if (day !== "weekday") return ["weekend"];
  const s = toMin(start);
  const e = toMin(end);
  return TIME_SLOTS.filter((slot) => s < toMin(slot.to) && e > toMin(slot.from)).map((slot) => slot.id);
}

/** 만 0~5세 영유아, 만 6~8세 초등. 나이를 모르면 null */
export function targetFor(age: number | null): Target | null {
  if (age === null) return null;
  return age <= 5 ? "infant" : "school";
}

/** 클라이언트 → /api/events 로 보내는 입력. 좌표(center)는 서버가 행정동 코드로 바꾼 뒤 버린다. */
export interface DemandEventInput {
  event_type: EventType;
  emd_code?: string | null;
  center?: { lat: number; lng: number } | null;
  day?: Day;
  start?: string;
  end?: string;
  age?: number | null;
  facility_types?: FacilityKind[];
  meta?: Record<string, string | number | boolean>;
}
