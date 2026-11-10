import { describe, expect, it } from "vitest";
import { dropDuplicates } from "@/lib/extras";
import { normalizeRow } from "@/lib/normalize";
import { normalizeLocalCenter, parseResponse } from "@/lib/server/sources/localCenterStd";

// 공공데이터포털 전국지역아동센터표준데이터 샘플 행 (마포구)
const row = {
  CNTR_NM: "열린지역아동센터",
  CTPV_NM: "서울특별시",
  SGG_NM: "마포구",
  LCTN_ROAD_NM: "서울특별시 마포구 월드컵북로48길 8(상암동)",
  LCTN_LOTNO_ADDR: "서울특별시 마포구 상암동 34-34",
  LAT: "37.57653804",
  LOT: "126.8943915",
  TELNO: "02-304-1930",
  PSCP_CNT: "19",
  NOW_NOPE: "16",
  TNOEMP: "2",
  OPER_INST_TYPE: "사회적협동조합",
  DATA_CRTR_YMD: "2026-10-02",
};

describe("지역아동센터 표준데이터", () => {
  it("정원·현원·종사자수·기준일을 같은 시설 스키마로 바꾼다", () => {
    const f = normalizeLocalCenter(row)!;
    expect(f).toMatchObject({ kind: "localcenter", capacity: 19, enrolled: 16, vacancy: 3, staff: 2, asOf: "2026-10-02", source: "localcenter-std" });
    expect(f.ageOpen.slice(6)).toEqual([true, true, true]);
    expect(f.id).toMatch(/^lc:[0-9a-f]{16}$/);
    // 같은 이름·주소면 같은 ID (매일 수집해도 문서가 이어진다)
    expect(normalizeLocalCenter({ ...row, NOW_NOPE: "19" })!.id).toBe(f.id);
  });

  it("빈 정원·현원은 '정보 없음'(null)으로, 좌표가 없으면 제외", () => {
    expect(normalizeLocalCenter({ ...row, PSCP_CNT: "", NOW_NOPE: "" })!.vacancy).toBeNull();
    expect(normalizeLocalCenter({ ...row, LAT: "", LOT: "" })).toBeNull();
  });

  it("응답의 items 배열·item 래핑·데이터 없음을 처리하고 오류 코드는 실패로 본다", () => {
    const ok = (items: unknown) => ({ response: { header: { resultCode: "00" }, body: { items, totalCount: "1" } } });
    expect(parseResponse(ok([row])).rows).toHaveLength(1);
    expect(parseResponse(ok({ item: [row] })).rows).toHaveLength(1);
    expect(parseResponse(ok({ item: row })).rows).toHaveLength(1);
    expect(parseResponse({ response: { header: { resultCode: "03" } } }).rows).toEqual([]);
    expect(() => parseResponse({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } })).toThrow(/SERVICE_KEY/);
  });

  it("공공데이터와 겹치는 카카오 검색 결과는 뺀다", () => {
    const official = normalizeLocalCenter(row)!;
    const dup = { ...official, id: "kakao:1", source: "kakao-places", lat: official.lat + 0.0002 };
    const other = { ...dup, id: "kakao:2", lat: official.lat + 0.01 };
    expect(dropDuplicates([dup, other], [official]).map((f) => f.id)).toEqual(["kakao:2"]);
  });
});

describe("어린이집 명세 v1.7 필드", () => {
  const base = { STCODE: "1", CRNAME: "가", CRSTATUSNAME: "정상", CRCAPAT: "20", CRCHCNT: "15", LA: "37.5", LO: "126.9" };
  it("보육교직원수(CHCRTESCNT)와 입소대기 아동수(EW_CNT_*)를 읽는다", () => {
    const f = normalizeRow({ ...base, CHCRTESCNT: "7", EW_CNT_00: "3", EW_CNT_02: "12" })!;
    expect(f.staff).toBe(7);
    expect(f.waitlist).toEqual([3, 0, 12, 0, 0, 0]);
    expect(normalizeRow(base)!.staff).toBeNull();
    expect(normalizeRow(base)!.waitlist).toBeNull();
  });
  it("영유아혼합반(M3)은 만 2~3세를 연다", () => {
    expect(normalizeRow({ ...base, CLASS_CNT_M3: 1 })!.ageOpen.slice(0, 6)).toEqual([false, false, true, true, false, false]);
  });
});
