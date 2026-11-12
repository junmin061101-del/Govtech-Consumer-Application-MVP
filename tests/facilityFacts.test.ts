import { describe, expect, it } from "vitest";
import { ageRange, bestIds, facts, features, weekdayHours } from "@/lib/facilityFacts";
import { normalizeRow } from "@/lib/normalize";
import type { Facility, Match } from "@/lib/types";

const daycare = (id: string, enrolled: number, spec = "") =>
  normalizeRow({ STCODE: id, CRNAME: `어린이집${id}`, CRTYPENAME: "국공립", CRSTATUSNAME: "정상", CRCAPAT: "46", CRCHCNT: String(enrolled), LA: "37.5", LO: "126.95", CRSPEC: spec, CLASS_CNT_02: 1, CLASS_CNT_03: 1, DATASTDRDT: "2026-11-10" })!;
const match = (f: Facility, d: number | null): Match => ({ facility: f, distanceM: d, hours: { label: "기본 보육시간 (07:30~19:30)", confidence: "confirmed" } });

describe("시설 정보 표·비교", () => {
  it("아이사랑 '정보 더보기'처럼 유형·특성·정원/현원·운영시간을 만든다", () => {
    const f = daycare("1", 45, "야간연장형");
    const rows = Object.fromEntries(facts(match(f, 320)).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ kind: "어린이집 · 국공립", capacity: "정원 46명 · 현원 45명", vacancy: "1명", features: "야간연장", distance: "320m", ages: "만 2~3세" });
    expect(weekdayHours(f)).toContain("07:30");
  });

  it("센터·키움센터는 실제 운영시간과 토요일 운영을 쓴다", () => {
    const k = { ...daycare("2", 0), kind: "kiumcenter" as const, capacity: 35, enrolled: null, vacancy: null, hours: { weekday: { open: "13:00", close: "20:00" }, sat: { open: "09:00", close: "15:00" } }, ageOpen: [false, false, false, false, false, false, true, true, true] };
    expect(weekdayHours(k)).toBe("13:00~20:00");
    expect(features(k)).toEqual(["토요일 09:00~15:00"]);
    expect(ageRange(k)).toBe("만 6~8세");
    expect(Object.fromEntries(facts(match(k, null)).map((r) => [r.key, r.value])).capacity).toBe("정원 35명");
  });

  it("비교: 빈자리 최다·가장 가까운 곳을 하나만 고르고, 동점이면 표시하지 않는다", () => {
    const a = match(daycare("a", 40), 900);
    const b = match(daycare("b", 30), 300);
    const c = match(daycare("c", 30), 300);
    expect(bestIds([a, b])).toMatchObject({ vacancy: "b", distance: "b" });
    expect(bestIds([b, c])).toMatchObject({ vacancy: undefined, distance: undefined });
  });
});
