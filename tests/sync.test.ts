import { beforeEach, describe, expect, it } from "vitest";
import { encodeGeohash } from "@/lib/geohash";
import { normalizeRow } from "@/lib/normalize";
import { facilitiesInBounds, syncFacilities } from "@/lib/server/facilities";
import type { FacilitySource } from "@/lib/server/sources";
import { districtServices } from "@/lib/server/sources/seoulChildcare";
import type { Facility } from "@/lib/types";
import { fresh } from "./helpers";

const row = (id: string, lat: number, lng: number, enrolled = 15) =>
  normalizeRow({ STCODE: id, CRNAME: `시설${id}`, CRSTATUSNAME: "정상", CRCAPAT: "20", CRCHCNT: String(enrolled), LA: String(lat), LO: String(lng) })!;

function source(list: () => Facility[]): FacilitySource {
  return {
    id: "seoul-childcare",
    kind: "daycare",
    label: "test",
    run: async () => ({ facilities: list(), parts: [{ key: "11590", count: 0 }, { key: "11140", count: 0 }], partial: false }),
  };
}

describe("시설 수집", () => {
  beforeEach(fresh);

  it("서울 여러 구 시설에 행정동 코드·geohash·수집일을 붙이고, 서울 밖은 뺀다", async () => {
    const r = await syncFacilities([source(() => [row("1", 37.5131, 126.9426), row("2", 37.5663, 126.9779), row("3", 35.18, 129.07)])]);
    expect(r.total).toBe(2);
    const { facilities } = await facilitiesInBounds({ swLat: 37.4, swLng: 126.8, neLat: 37.7, neLng: 127.2 });
    expect(facilities.map((f) => f.sigunguCode).sort()).toEqual(["11140", "11590"]);
    expect(facilities[0].collectedAt).toBe(r.startedAt);
    expect(facilities.every((f) => /^11\d{8}$/.test(f.emdCode!))).toBe(true);
  });

  it("화면 영역 밖 시설은 내려주지 않는다", async () => {
    await syncFacilities([source(() => [row("1", 37.5131, 126.9426), row("2", 37.5663, 126.9779)])]);
    const { facilities } = await facilitiesInBounds({ swLat: 37.5, swLng: 126.93, neLat: 37.52, neLng: 126.95 });
    expect(facilities.map((f) => f.id)).toEqual(["1"]);
  });

  it("다음 수집에서 정원·현원 변화를 찾아낸다", async () => {
    let enrolled = 20;
    const src = source(() => [row("1", 37.5131, 126.9426, enrolled)]);
    await syncFacilities([src]);
    enrolled = 18;
    const r = await syncFacilities([src]);
    expect(r.changes).toEqual([{ id: "1", prevVacancy: 0, vacancy: 2 }]);
  });

  it("구별 서비스명은 설정 파일 값만 쓴다 (확인 안 된 구는 비워 둔다)", () => {
    const list = districtServices();
    expect(list).toHaveLength(25);
    expect(list.find((d) => d.code === "11590")?.service).toBe("ChildCareInfoDJ");
  });

  it("geohash", () => {
    expect(encodeGeohash(37.5665, 126.978, 6)).toBe("wydm9q");
  });
});
