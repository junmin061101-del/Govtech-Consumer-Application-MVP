import { beforeEach, describe, expect, it } from "vitest";
import { targetFor, timeSlotsFor } from "@/lib/events";
import { EVENT_FIELDS, EVENTS, logDemandEvent, type DemandEvent } from "@/lib/server/events";
import { store } from "@/lib/server/store";
import { withdraw } from "@/lib/server/users";
import { fresh, NORYANGJIN } from "./helpers";

const UID = "kakao:123456789";
const all = () => store().list<DemandEvent>(EVENTS);

describe("시간대·대상 구분", () => {
  it("평일 시간대를 겹치는 구간으로 나누고 주말은 하나로 묶는다", () => {
    expect(timeSlotsFor("weekday", "09:00", "18:00")).toEqual(["wd_09_18"]);
    expect(timeSlotsFor("weekday", "07:30", "19:00")).toEqual(["wd_07_09", "wd_09_18", "wd_18_20"]);
    expect(timeSlotsFor("weekday", "20:00", "22:00")).toEqual(["wd_20_22"]);
    expect(timeSlotsFor("weekday", "22:00", "23:00")).toEqual([]);
    expect(timeSlotsFor("sat", "10:00", "12:00")).toEqual(["weekend"]);
  });
  it("만 0~5세 영유아, 6~8세 초등", () => {
    expect(targetFor(0)).toBe("infant");
    expect(targetFor(5)).toBe("infant");
    expect(targetFor(6)).toBe("school");
    expect(targetFor(null)).toBeNull();
  });
});

describe("logDemandEvent", () => {
  beforeEach(fresh);

  it("공통 필드만 저장하고 개인정보(uid·좌표·자유 텍스트)는 넣지 않는다", async () => {
    await logDemandEvent(UID, {
      event_type: "search_no_result",
      center: NORYANGJIN,
      day: "weekday",
      start: "18:00",
      end: "21:00",
      age: 2,
      facility_types: ["daycare"],
      // 허용되지 않은 키·값은 버려져야 한다
      meta: { walk_min: 10, name: "김민수", phone: "01012345678", note: "우리 아이 이름은 지우" } as never,
      ...({ uid: UID, phone: "01012345678", lat: 37.5 } as object),
    });
    const [ev] = await all();
    const { id: _id, ...doc } = ev;
    expect(Object.keys(doc).sort()).toEqual([...EVENT_FIELDS].sort());
    expect(doc.emd_code).toMatch(/^11590\d{5}$/);
    expect(doc.time_slot).toEqual(["wd_18_20", "wd_20_22"]);
    expect(doc.target).toBe("infant");
    expect(doc.meta).toEqual({ walk_min: 10 });

    const text = JSON.stringify(doc);
    expect(text).not.toContain(UID);
    expect(text).not.toContain("123456789");
    expect(text).not.toContain("0101234");
    expect(text).not.toContain("37.51");
    expect(text).not.toContain("126.94");
    expect(text).not.toContain("김민수");
    expect(doc.pkey).toHaveLength(32);
  });

  it("같은 가명 키·같은 조건을 24시간 안에 반복하면 하나로 묶는다", async () => {
    const input = { event_type: "search_no_result" as const, center: NORYANGJIN, day: "weekday" as const, start: "09:00", end: "18:00", age: 1 };
    const t0 = new Date("2026-11-01T00:00:00Z");
    expect((await logDemandEvent(UID, input, t0)).deduped).toBe(false);
    expect((await logDemandEvent(UID, input, new Date(t0.getTime() + 3600_000))).deduped).toBe(true);
    let list = await all();
    expect(list).toHaveLength(1);
    expect(list[0].repeat_count).toBe(1);

    // 조건(대상 연령대)이 다르면 따로, 24시간이 지나면 새 이벤트. 같은 영유아면 1세·4세는 같은 조건이다
    await logDemandEvent(UID, { ...input, age: 4 }, t0);
    expect(await all()).toHaveLength(1);
    await logDemandEvent(UID, { ...input, age: 7 }, t0);
    await logDemandEvent(UID, input, new Date(t0.getTime() + 25 * 3600_000));
    list = await all();
    expect(list).toHaveLength(3);
    // 다른 사람의 같은 조건은 묶지 않는다
    await logDemandEvent("kakao:other", input, t0);
    expect(await all()).toHaveLength(4);
  });

  it("탈퇴하면 가명 키 솔트를 폐기해 이후 같은 uid 라도 다른 pkey 가 된다 (연결 해제)", async () => {
    await logDemandEvent(UID, { event_type: "apply_step", meta: { step: 1 } });
    const before = (await all())[0].pkey;
    await withdraw(UID);
    await logDemandEvent(UID, { event_type: "apply_step", meta: { step: 1 } });
    const pkeys = (await all()).map((e) => e.pkey);
    expect(pkeys).toHaveLength(2);
    expect(new Set(pkeys).size).toBe(2);
    expect(pkeys).toContain(before);
  });

  it("알 수 없는 이벤트 종류는 거절하고, 잘못된 행정동 코드는 버린다", async () => {
    await expect(logDemandEvent(UID, { event_type: "page_view" as never })).rejects.toThrow();
    await logDemandEvent(UID, { event_type: "vacancy_resolved", emd_code: "99999", meta: { response: "applied" } });
    expect((await all())[0].emd_code).toBeNull();
  });
});
