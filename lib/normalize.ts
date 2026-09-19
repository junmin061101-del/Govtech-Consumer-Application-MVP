import { AGES, type Facility } from "./types";

/** 열린데이터광장 ChildCareInfoDJ 의 row 중 사용하는 필드 */
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
  CLASS_CNT_M2?: number;
  CLASS_CNT_M5?: number;
}

export type HoursOverrides = Record<string, Facility["extended"]>;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 동작구 대략 범위. 좌표가 비었거나 엉뚱한 시설을 지도에서 제외하기 위한 방어선.
const inDongjak = (lat: number, lng: number) =>
  lat > 37.45 && lat < 37.53 && lng > 126.9 && lng < 127.0;

/**
 * 연령별 반 개설 여부.
 * M2/M5 는 혼합반이며 각각 만 0~2세, 만 3~5세를 포함한다고 가정한다(보수적 해석).
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
  const m5 = num(row.CLASS_CNT_M5) > 0;
  const open = cls.map((c, age) => c > 0 || (age <= 2 ? m2 : m5));
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

export function normalizeRow(row: RawRow, overrides: HoursOverrides = {}): Facility | null {
  // 운영 중인 시설만: 정상, 휴지 후 재개. 휴지·폐지는 제외
  if (row.CRSTATUSNAME !== "정상" && row.CRSTATUSNAME !== "재개") return null;
  const lat = num(row.LA);
  const lng = num(row.LO);
  if (!row.STCODE || !row.CRNAME || !inDongjak(lat, lng)) return null;

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
  };
}

export function normalizeRows(rows: RawRow[], overrides: HoursOverrides = {}): Facility[] {
  return rows.flatMap((r) => normalizeRow(r, overrides) ?? []);
}
