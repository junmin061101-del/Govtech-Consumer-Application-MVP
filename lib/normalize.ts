import type { Facility } from "./types";

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
  return cls.map((c, age) => c > 0 || (age <= 2 ? m2 : m5));
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
    extended: overrides[row.STCODE] ?? {},
    asOf: row.DATASTDRDT ?? "",
  };
}

export function normalizeRows(rows: RawRow[], overrides: HoursOverrides = {}): Facility[] {
  return rows.flatMap((r) => normalizeRow(r, overrides) ?? []);
}
