import { AGES, type Facility } from "./types";

/**
 * 열린데이터광장 구별 어린이집 정보(표준 데이터) row 중 사용하는 필드.
 * 필드명은 원천인 보육정보공개 API(cpmsapi030, 서비스명세서 v1.7, 2026-04)와 같다(대문자).
 */
export interface RawRow {
  STCODE?: string;
  CRNAME?: string;
  CRTYPENAME?: string;
  CRSTATUSNAME?: string;
  CRADDR?: string;
  CRTELNO?: string;
  CRHOME?: string;
  CRCAPAT?: string | number;
  CRCHCNT?: string | number;
  LA?: string | number;
  LO?: string | number;
  DATASTDRDT?: string;
  /** 어린이집 특성. 쉼표 구분 (예: "장애아통합,야간연장형,휴일보육") */
  CRSPEC?: string;
  CLASS_CNT_00?: number;
  CLASS_CNT_01?: number;
  CLASS_CNT_02?: number;
  CLASS_CNT_03?: number;
  CLASS_CNT_04?: number;
  CLASS_CNT_05?: number;
  /** 영아혼합(만 0~2세) */
  CLASS_CNT_M2?: number;
  /** 영유아혼합(만 2~3세). 명세 v1.7 에서 추가 */
  CLASS_CNT_M3?: number;
  /** 유아혼합(만 3~5세) */
  CLASS_CNT_M5?: number;
  /** 보육교직원수 */
  CHCRTESCNT?: string | number;
  /** 연령별 입소대기 아동수 (명세 v1.6 에서 추가) */
  EW_CNT_00?: string | number;
  EW_CNT_01?: string | number;
  EW_CNT_02?: string | number;
  EW_CNT_03?: string | number;
  EW_CNT_04?: string | number;
  EW_CNT_05?: string | number;
}

export type HoursOverrides = Record<string, Facility["extended"]>;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 좌표가 비었거나 0 인 행을 거르는 최소 방어선(대한민국 대략 범위).
// 어느 행정동에 속하는지는 수집 단계에서 서버가 경계 데이터로 판정한다(lib/server/regions.ts).
const plausible = (lat: number, lng: number) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

/** 숫자 필드가 비어 있으면 null (0 과 구분) */
const numOrNull = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * 연령별 반 개설 여부.
 * 혼합반은 명세의 연령 범위를 따른다: M2 만 0~2세, M3 만 2~3세, M5 만 3~5세.
 * 어린이집은 만 5세까지라 6~8세는 항상 false.
 */
function ageOpen(row: RawRow): boolean[] {
  const cls = [
    row.CLASS_CNT_00,
    row.CLASS_CNT_01,
    row.CLASS_CNT_02,
    row.CLASS_CNT_03,
    row.CLASS_CNT_04,
    row.CLASS_CNT_05,
  ].map(num);
  const m2 = num(row.CLASS_CNT_M2) > 0;
  const m3 = num(row.CLASS_CNT_M3) > 0;
  const m5 = num(row.CLASS_CNT_M5) > 0;
  const open = cls.map((c, age) => c > 0 || (age <= 2 && m2) || ((age === 2 || age === 3) && m3) || (age >= 3 && m5));
  return AGES.map((age) => open[age] ?? false);
}

/**
 * CRSPEC 에서 기본 보육시간 밖 운영 여부를 읽는다.
 * 야간연장형은 종료 시각이 데이터에 없으므로 closeTime 을 비워 두고(=확인 필요),
 * 24시간형만 심야까지 확정한다. 휴일보육은 운영 시간대를 알 수 없다.
 */
function extendedFromSpec(spec: string | undefined): Facility["extended"] {
  const tags = (spec ?? "").split(",").map((t) => t.trim());
  const is24h = tags.includes("24시간");
  const out: Facility["extended"] = {};
  if (tags.includes("야간연장형") || is24h) out.night = true;
  if (is24h) out.closeTime = "23:59";
  if (tags.includes("휴일보육")) out.weekend = true;
  return out;
}

/** 만 0~5세 입소대기 아동수. 원천에 필드가 없으면 null */
function waitlist(row: RawRow): number[] | null {
  const v = [row.EW_CNT_00, row.EW_CNT_01, row.EW_CNT_02, row.EW_CNT_03, row.EW_CNT_04, row.EW_CNT_05].map(numOrNull);
  return v.every((x) => x === null) ? null : v.map((x) => x ?? 0);
}

export function normalizeRow(row: RawRow, overrides: HoursOverrides = {}): Facility | null {
  // 운영 중인 시설만: 정상, 휴지 후 재개. 휴지·폐지는 제외
  if (row.CRSTATUSNAME !== "정상" && row.CRSTATUSNAME !== "재개") return null;
  const lat = num(row.LA);
  const lng = num(row.LO);
  if (!row.STCODE || !row.CRNAME || !plausible(lat, lng)) return null;

  const capacity = num(row.CRCAPAT);
  const enrolled = num(row.CRCHCNT);
  const homepage = (row.CRHOME ?? "").trim();

  return {
    id: row.STCODE,
    kind: "daycare",
    name: row.CRNAME,
    type: row.CRTYPENAME ?? "",
    address: row.CRADDR ?? "",
    phone: (row.CRTELNO ?? "").trim(),
    homepage: /^https?:\/\//i.test(homepage) ? homepage : homepage ? `http://${homepage}` : "",
    lat,
    lng,
    capacity,
    enrolled,
    vacancy: Math.max(0, capacity - enrolled),
    ageOpen: ageOpen(row),
    // 수동 보강 데이터가 있으면 API 값보다 우선
    extended: { ...extendedFromSpec(row.CRSPEC), ...overrides[row.STCODE] },
    asOf: row.DATASTDRDT ?? "",
    staff: numOrNull(row.CHCRTESCNT),
    waitlist: waitlist(row),
    source: "seoul-childcare",
  };
}

export function normalizeRows(rows: RawRow[], overrides: HoursOverrides = {}): Facility[] {
  return rows.flatMap((r) => normalizeRow(r, overrides) ?? []);
}
