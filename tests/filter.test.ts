import { describe, expect, it } from "vitest";
import { matchFacilities } from "@/lib/filter";
import { normalizeRow } from "@/lib/normalize";
import type { Facility, Filters } from "@/lib/types";

const base: Facility = {
  id: "a",
  kind: "daycare",
  name: "테스트어린이집",
  type: "국공립",
  address: "",
  phone: "",
  homepage: "",
  lat: 37.5124,
  lng: 126.9393,
  capacity: 20,
  enrolled: 15,
  vacancy: 5,
  ageOpen: [true, true, true, false, false, false, false, false, false],
  extended: {},
  asOf: "2026-09-18",
};

const filters: Filters = {
  age: 1,
  kinds: [],
  day: "weekday",
  start: "09:00",
  end: "17:00",
  center: null,
  radiusM: 1000,
};

describe("matchFacilities", () => {
  it("빈자리·연령·기본시간이 맞으면 통과한다", () => {
    const [m] = matchFacilities([base], filters);
    expect(m.facility.id).toBe("a");
    expect(m.hours.confidence).toBe("confirmed");
  });

  it("빈자리가 없으면 제외한다", () => {
    expect(matchFacilities([{ ...base, vacancy: 0 }], filters)).toHaveLength(0);
  });

  it("해당 연령 반이 없으면 제외한다", () => {
    expect(matchFacilities([base], { ...filters, age: 4 })).toHaveLength(0);
  });

  it("19:30 이후는 야간연장 정보가 있는 시설만 통과한다", () => {
    const late = { ...filters, start: "19:00", end: "21:00" };
    expect(matchFacilities([base], late)).toHaveLength(0);
    const night = { ...base, extended: { night: true, closeTime: "22:00" } };
    expect(matchFacilities([night], late)).toHaveLength(1);
  });

  it("주말은 휴일보육 시설만 통과하고, 운영 시간은 '확인 필요'로 표시한다", () => {
    expect(matchFacilities([base], { ...filters, day: "sat" })).toHaveLength(0);
    const sat = { ...base, extended: { weekend: true } };
    const [m] = matchFacilities([sat], { ...filters, day: "sat" });
    expect(m.hours.confidence).toBe("needs-check");
  });

  it("종료 시각을 모르는 야간연장형은 통과하되 '확인 필요', 종료 시각을 넘는 요청은 제외한다", () => {
    const late = { ...filters, start: "19:00", end: "21:00" };
    const unknownClose = { ...base, extended: { night: true } };
    expect(matchFacilities([unknownClose], late)[0].hours.confidence).toBe("needs-check");
    const closes20 = { ...base, extended: { night: true, closeTime: "20:00" } };
    expect(matchFacilities([closes20], late)).toHaveLength(0);
  });

  it("반경 밖은 제외하고 가까운 순으로 정렬한다", () => {
    const near = { ...base, id: "near" };
    const mid = { ...base, id: "mid", lat: base.lat + 0.004 }; // 약 445m
    const far = { ...base, id: "far", lat: base.lat + 0.02 }; // 약 2.2km
    const center = { lat: base.lat, lng: base.lng, label: "here" };
    const res = matchFacilities([far, mid, near], { ...filters, center });
    expect(res.map((r) => r.facility.id)).toEqual(["near", "mid"]);
  });
});

describe("시설 종류 확장", () => {
  const kindergarten: Facility = {
    ...base,
    id: "k",
    kind: "kindergarten",
    capacity: null,
    enrolled: null,
    vacancy: null,
    ageOpen: [false, false, false, true, true, true, false, false, false],
  };
  const localCenter: Facility = { ...kindergarten, id: "l", kind: "localcenter", ageOpen: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((a) => a >= 6) };

  it("빈자리 정보가 없는(null) 시설도 조건이 맞으면 지도에 남는다", () => {
    const res = matchFacilities([kindergarten], { ...filters, age: 4 });
    expect(res).toHaveLength(1);
    expect(res[0].hours.confidence).toBe("needs-check");
  });

  it("만 6~8세는 지역아동센터만, 만 3~5세는 유치원이 대상이다", () => {
    const all = [base, kindergarten, localCenter];
    expect(matchFacilities(all, { ...filters, age: 7 }).map((m) => m.facility.id)).toEqual(["l"]);
    expect(matchFacilities(all, { ...filters, age: 4 }).map((m) => m.facility.id)).toEqual(["k"]);
  });

  it("시설 종류를 고르면 그 종류만 보인다", () => {
    const all = [base, kindergarten, localCenter];
    const res = matchFacilities(all, { ...filters, age: null, kinds: ["localcenter"] });
    expect(res.map((m) => m.facility.id)).toEqual(["l"]);
  });

  it("운영시간 정보가 없는 종류는 야간·주말 검색에서 제외한다", () => {
    const night = { ...filters, age: 4, start: "19:00", end: "21:00" };
    expect(matchFacilities([kindergarten], night)).toHaveLength(0);
    expect(matchFacilities([kindergarten], { ...filters, age: 4, day: "sat" as const })).toHaveLength(0);
  });

  it("빈자리가 0으로 확인된 시설만 제외하고 정보 없음(null)은 남긴다", () => {
    expect(matchFacilities([{ ...base, vacancy: 0 }], filters)).toHaveLength(0);
    expect(matchFacilities([{ ...base, vacancy: null }], filters)).toHaveLength(1);
  });
});

describe("normalizeRow", () => {
  const row = {
    STCODE: "1",
    CRNAME: "스마일어린이집",
    CRTYPENAME: "가정",
    CRSTATUSNAME: "정상",
    CRCAPAT: "20",
    CRCHCNT: "15",
    LA: "37.4992",
    LO: "126.9345",
    CLASS_CNT_00: 2,
    CLASS_CNT_01: 2,
    CLASS_CNT_M2: 1,
  };

  it("정원-현원으로 빈자리를 계산하고 혼합반을 연령에 반영한다", () => {
    const f = normalizeRow(row)!;
    expect(f.vacancy).toBe(5);
    expect(f.ageOpen).toEqual([true, true, true, false, false, false, false, false, false]);
    expect(f.kind).toBe("daycare");
  });

  it("휴지 후 재개한 시설은 포함하고, 휴지·폐지·좌표 오류 시설은 걸러낸다", () => {
    expect(normalizeRow({ ...row, CRSTATUSNAME: "재개" })).not.toBeNull();
    expect(normalizeRow({ ...row, CRSTATUSNAME: "휴지" })).toBeNull();
    expect(normalizeRow({ ...row, CRSTATUSNAME: "폐지" })).toBeNull();
    expect(normalizeRow({ ...row, LA: "", LO: "" })).toBeNull();
  });

  it("CRSPEC 에서 야간연장형·휴일보육·24시간을 읽는다", () => {
    expect(normalizeRow({ ...row, CRSPEC: "일반" })!.extended).toEqual({});
    expect(normalizeRow({ ...row, CRSPEC: "장애아통합,야간연장형,휴일보육" })!.extended).toEqual({
      night: true,
      weekend: true,
    });
    expect(normalizeRow({ ...row, CRSPEC: "야간연장형,24시간" })!.extended).toEqual({
      night: true,
      closeTime: "23:59",
    });
  });

  it("정원보다 현원이 많아도 빈자리는 음수가 되지 않는다", () => {
    expect(normalizeRow({ ...row, CRCHCNT: "25" })!.vacancy).toBe(0);
  });
});
