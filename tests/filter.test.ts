import { describe, expect, it } from "vitest";
import { matchFacilities } from "@/lib/filter";
import { normalizeRow } from "@/lib/normalize";
import type { Facility, Filters } from "@/lib/types";

const base: Facility = {
  id: "a",
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
  ageOpen: [true, true, true, false, false, false],
  extended: {},
  asOf: "2026-09-18",
};

const filters: Filters = {
  age: 1,
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

  it("주말은 주말 운영 정보가 있는 시설만 통과한다", () => {
    expect(matchFacilities([base], { ...filters, day: "sat" })).toHaveLength(0);
    const sat = { ...base, extended: { weekend: true } };
    expect(matchFacilities([sat], { ...filters, day: "sat" })).toHaveLength(1);
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
    expect(f.ageOpen).toEqual([true, true, true, false, false, false]);
  });

  it("휴지 후 재개한 시설은 포함하고, 휴지·폐지·좌표 오류 시설은 걸러낸다", () => {
    expect(normalizeRow({ ...row, CRSTATUSNAME: "재개" })).not.toBeNull();
    expect(normalizeRow({ ...row, CRSTATUSNAME: "휴지" })).toBeNull();
    expect(normalizeRow({ ...row, CRSTATUSNAME: "폐지" })).toBeNull();
    expect(normalizeRow({ ...row, LA: "", LO: "" })).toBeNull();
  });

  it("정원보다 현원이 많아도 빈자리는 음수가 되지 않는다", () => {
    expect(normalizeRow({ ...row, CRCHCNT: "25" })!.vacancy).toBe(0);
  });
});
