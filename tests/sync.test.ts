import { beforeEach, describe, expect, it } from "vitest";
import { encodeGeohash } from "@/lib/geohash";
import { normalizeRow } from "@/lib/normalize";
import { facilitiesInBounds, syncFacilities } from "@/lib/server/facilities";
import type { FacilitySource } from "@/lib/server/sources";
import { childcareService, DISTRICTS, fetchAll, summarize } from "@/lib/server/sources/seoulChildcare";
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

  it("서울시 어린이집 정보(ChildCareInfo) 한 서비스로 25개 구 전체를 페이지 나눠 받는다", async () => {
    expect(childcareService()).toBe("ChildCareInfo");
    expect(DISTRICTS).toHaveLength(25);
    const all = Array.from({ length: 2300 }, (_, i) => ({ STCODE: `${i % 2 ? "11590" : "11680"}${String(i).padStart(6, "0")}` }));
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      const [s, e] = url.split("/").slice(-3, -1).map(Number);
      return new Response(JSON.stringify({ ChildCareInfo: { list_total_count: all.length, row: all.slice(s - 1, e) } }));
    }) as unknown as typeof fetch;
    const rows = await fetchAll("k", "ChildCareInfo", false, fake);
    expect(rows).toHaveLength(2300);
    expect(urls.map((u) => u.split("/").slice(-3, -1).join("-"))).toEqual(["1-1000", "1001-2000", "2001-2300"]);
  });

  it("중간에 끊기면 실패로 본다 (그 회차는 폐지 시설 정리를 하지 않는다)", async () => {
    const fake = (async (url: string) =>
      url.includes("/1/1000/")
        ? new Response(JSON.stringify({ ChildCareInfo: { list_total_count: 1500, row: [{ STCODE: "1" }] } }))
        : new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchAll("k", "ChildCareInfo", false, fake, [1, 1])).rejects.toThrow();
  });

  it("수집 보고는 시설코드 앞 5자리로 구별 건수를 센다", () => {
    const a = row("11680000001", 37.5, 127.05);
    const b = row("11590000001", 37.5131, 126.9426);
    const parts = summarize([{ STCODE: a.id }, { STCODE: b.id }, { STCODE: "11590000002" }], [a, b]);
    expect(parts.find((p) => p.key === "11680")?.count).toBe(1);
    expect(parts.find((p) => p.key === "11590")?.count).toBe(1);
    expect(parts).toHaveLength(25);
  });

  it("geohash", () => {
    expect(encodeGeohash(37.5665, 126.978, 6)).toBe("wydm9q");
  });
});

describe("수집 재시도", () => {
  it("연결이 잠깐 끊겨도(fetch failed) 다시 시도해서 받는다", async () => {
    let n = 0;
    const flaky = (async () => {
      n++;
      if (n < 3) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ ChildCareInfo: { list_total_count: 1, row: [{ STCODE: "1" }] } }));
    }) as unknown as typeof fetch;
    expect(await fetchAll("k", "ChildCareInfo", false, flaky, [1, 1])).toHaveLength(1);
    expect(n).toBe(3);
  });

  it("키·서비스명 오류는 다시 묻지 않고 바로 실패, 재시도도 다 실패하면 실패", async () => {
    let n = 0;
    const bad = (async () => {
      n++;
      return new Response(JSON.stringify({ RESULT: { CODE: "INFO-100", MESSAGE: "인증키가 유효하지 않습니다" } }));
    }) as unknown as typeof fetch;
    await expect(fetchAll("k", "ChildCareInfo", false, bad, [1, 1])).rejects.toThrow("인증키");
    expect(n).toBe(1);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchAll("k", "ChildCareInfo", false, down, [1, 1])).rejects.toThrow("fetch failed");
  });

  it("오류로 못 받은 회차는 '샘플 데이터'로 표시하지 않는다", async () => {
    const failing: FacilitySource = { id: "seoul-childcare", kind: "daycare", label: "t", run: async () => ({ facilities: [], parts: [{ key: "seoul", count: 0, error: "fetch failed" }], partial: true }) };
    expect((await syncFacilities([failing])).sample).toBe(false);
  });
});
