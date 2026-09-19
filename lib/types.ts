export type Day = "weekday" | "sat" | "sun";

/** 정보의 신뢰 수준. 기획서의 '확인됨 / 확인 필요' 구분을 시민 화면에 그대로 쓴다. */
export type Confidence = "confirmed" | "needs-check";

export interface Facility {
  id: string;
  name: string;
  type: string; // 국공립, 가정, 민간 ...
  address: string;
  phone: string;
  homepage: string;
  lat: number;
  lng: number;
  capacity: number;
  enrolled: number;
  vacancy: number; // max(0, capacity - enrolled)
  /** 만 0~5세 각각에 해당하는 반이 있는지 (인덱스 = 만 나이) */
  ageOpen: boolean[];
  /** 기본 보육시간 밖 운영 여부. 열린데이터광장에는 없어서 별도 보강 데이터로만 채운다. */
  extended: { night?: boolean; weekend?: boolean; closeTime?: string };
  /** 데이터 기준일 (YYYY-MM-DD) */
  asOf: string;
}

export interface FacilitiesPayload {
  facilities: Facility[];
  source: "live" | "sample";
  fetchedAt: string;
}

export interface Filters {
  age: number | null; // 만 나이, null이면 전체
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
