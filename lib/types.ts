export type Day = "weekday" | "sat" | "sun";

export type FacilityKind = "daycare" | "kindergarten" | "localcenter" | "togethercare";

/** 정보의 신뢰 수준. 기획서의 '확인됨 / 확인 필요' 구분을 시민 화면에 그대로 쓴다. */
export type Confidence = "confirmed" | "needs-check";

/** 지원하는 만 나이 범위 (0~8세) */
export const AGES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface Facility {
  id: string;
  kind: FacilityKind;
  name: string;
  type: string; // 국공립, 가정, 유치원, 지역아동센터 ...
  address: string;
  phone: string;
  homepage: string;
  lat: number;
  lng: number;
  /** 정원·현원·빈자리. 데이터가 없는 시설 종류는 null (= 빈자리 정보 없음) */
  capacity: number | null;
  enrolled: number | null;
  vacancy: number | null;
  /** 만 0~8세 각각에 해당하는 반/대상이 있는지 (인덱스 = 만 나이) */
  ageOpen: boolean[];
  /** 기본 보육시간 밖 운영 여부 (어린이집만 데이터가 있다). */
  extended: { night?: boolean; weekend?: boolean; closeTime?: string };
  /** 데이터 기준일 (YYYY-MM-DD). 모르면 빈 문자열 */
  asOf: string;
  /** 시설 상세 페이지 (예: 카카오맵 장소 페이지) */
  detailUrl?: string;
}

export interface FacilitiesPayload {
  facilities: Facility[];
  source: "live" | "sample";
  fetchedAt: string;
}

export interface Filters {
  age: number | null; // 만 나이, null이면 전체
  kinds: FacilityKind[]; // 비어 있으면 전체 종류
  day: Day;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  center: { lat: number; lng: number; label: string } | null;
  radiusM: number;
}

export interface Match {
  facility: Facility;
  distanceM: number | null;
  /** 요청한 시간대가 운영시간에 들어가는지에 대한 근거 */
  hours: { label: string; confidence: Confidence };
}
