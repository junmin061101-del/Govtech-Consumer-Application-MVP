import { describe, expect, it } from "vitest";
import { findCombos } from "@/lib/combos";
import { matchFacilities, walkMinToM } from "@/lib/filter";
import { availability } from "@/lib/status";
import type { Facility, Filters } from "@/lib/types";
import { widenStep } from "@/lib/widen";

const base: Facility = {
  id: "a",
  kind: "localcenter",
  name: "A센터",
  type: "",
  address: "",
  phone: "",
  homepage: "",
  lat: 37.5124,
  lng: 126.9393,
  capacity: null,
  enrolled: null,
  vacancy: null,
  ageOpen: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((a) => a >= 6),
  extended: {},
  asOf: "",
};
const filters: Filters = {
  age: 7,
  kinds: [],
  day: "weekday",
  start: "13:00",
  end: "21:00",
  center: { lat: base.lat, lng: base.lng, label: "집" },
  radiusM: walkMinToM(15),
};

describe("상태 배지", () => {
  const now = new Date("2026-11-03T00:00:00Z");
  const daycare: Facility = { ...base, kind: "daycare", capacity: 20, enrolled: 15, vacancy: 5, asOf: "2026-10-25" };
  it("14일 안의 정원·현원으로 여유가 확인되면 이용 가능", () => {
    expect(availability(daycare, now)).toMatchObject({ status: "available", asOf: "2026-10-25" });
  });
  it("14일이 지났거나, 운영 정보만 있거나, 마감이면 확인 필요", () => {
    expect(availability({ ...daycare, asOf: "20261001" }, now).status).toBe("needs-check");
    expect(availability(base, now).status).toBe("needs-check");
    expect(availability({ ...daycare, vacancy: 0, enrolled: 20 }, now).label).toBe("정원 마감");
  });
});

describe("필요 시간대 필터", () => {
  it("운영시간을 아는 시설은 그 시간 안에 드는 요청만 남긴다", () => {
    const f = { ...base, hours: { weekday: { open: "13:00", close: "19:00" } } };
    expect(matchFacilities([f], { ...filters, start: "14:00", end: "18:00" })).toHaveLength(1);
    expect(matchFacilities([f], { ...filters, start: "14:00", end: "20:00" })).toHaveLength(0);
  });
  it("full 옵션은 정원이 찬 시설만 돌려준다", () => {
    const full = { ...base, kind: "daycare" as const, ageOpen: base.ageOpen.map(() => true), capacity: 10, enrolled: 10, vacancy: 0 };
    const f = { ...filters, age: 1, start: "09:00", end: "17:00" };
    expect(matchFacilities([full], f)).toHaveLength(0);
    expect(matchFacilities([full], f, { full: true })).toHaveLength(1);
  });
});

describe("조합 탐색", () => {
  const a = { ...base, id: "a", hours: { weekday: { open: "13:00", close: "19:00" } } };
  // 약 330m 떨어진 야간 시설 → 도보 5분
  const b = { ...base, id: "b", name: "B센터", lat: base.lat + 0.003, hours: { weekday: { open: "18:00", close: "22:00" } } };

  it("한 곳으로 못 채우는 시간을 두 시설로 이어 붙이고 이동 시간을 포함한다", () => {
    expect(matchFacilities([a, b], filters)).toHaveLength(0);
    const [c] = findCombos([a, b], filters);
    expect(c.first.id).toBe("a");
    expect(c.second.id).toBe("b");
    expect(c.handoff).toBe("19:00");
    expect(c.transferMin).toBeGreaterThan(0);
    expect(c.transferMin).toBeLessThanOrEqual(10);
  });

  it("두 번째 시설이 도착 시각에 열려 있지 않거나, 이동 범위 밖이면 조합하지 않는다", () => {
    const late = { ...b, hours: { weekday: { open: "19:30", close: "22:00" } } };
    expect(findCombos([a, late], filters)).toHaveLength(0);
    const far = { ...b, lat: base.lat + 0.03 };
    expect(findCombos([a, far], filters)).toHaveLength(0);
  });

  it("최대 3개까지만 제시한다", () => {
    const starters = [1, 2, 3, 4, 5].map((i) => ({ ...a, id: `a${i}`, lng: base.lng + i * 0.0003 }));
    expect(findCombos([...starters, b], filters)).toHaveLength(3);
  });

  it("운영시간을 모르는 시설로는 조합을 만들지 않는다", () => {
    expect(findCombos([{ ...a, hours: undefined }, b], filters)).toHaveLength(0);
  });
});

describe("범위 넓혀 다시 찾기", () => {
  it("거리는 다음 도보 단계로, 종류는 전체로, 시간은 기본 보육시간 밖 쪽을 30분 줄인다", () => {
    expect(widenStep(filters, "distance")).toMatchObject({ from: "15분", to: "20분" });
    expect(widenStep({ ...filters, radiusM: walkMinToM(30) }, "distance")).toBeNull();
    expect(widenStep({ ...filters, center: null }, "distance")).toBeNull();
    expect(widenStep(filters, "time")?.patch).toEqual({ end: "20:30" });
    expect(widenStep({ ...filters, start: "07:00", end: "18:00" }, "time")?.patch).toEqual({ start: "07:30" });
    expect(widenStep(filters, "kind")).toBeNull();
    expect(widenStep({ ...filters, kinds: ["daycare"] }, "kind")?.patch).toEqual({ kinds: [] });
  });
});
