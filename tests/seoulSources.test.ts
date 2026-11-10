import { beforeEach, describe, expect, it } from "vitest";
import { coversHours } from "@/lib/filter";
import { availability } from "@/lib/status";
import { hhmm, normalizeCareCenter } from "@/lib/server/sources/seoulCareCenter";
import { geocodeAll, normalizeKindergarten, parseOperHours, seoulKindergartenSource } from "@/lib/server/sources/seoulKindergarten";
import { syncFacilities, facilitiesInBounds } from "@/lib/server/facilities";
import { store } from "@/lib/server/store";
import { fresh } from "./helpers";

// 서울시 우리동네키움센터 시설현황정보 실제 행 모양 (2026-11)
const kium = {
  FCLTY_ID: "SC260901",
  FCLTY_NM: "서초7호점 우리동네키움센터",
  ATDRC_CODE: "11650",
  AGE_SE_NM: "초등학생",
  X_CRDNT_VALUE: "126.98902442418128",
  Y_CRDNT_VALUE: "37.48230051554142",
  BASS_ADRES: "서울특별시 서초구 서초대로 50",
  DETAIL_ADRES: "118동 (방배동, 디에이치방배)",
  SEMSTR_BEGIN_TIME: "1300",
  SEMSTR_END_TIME: "2000",
  SAT_OPER_AT: "Y",
  SAT_OPER_BEGIN_TIME: "0900",
  SAT_OPER_END_TIME: "1500",
  ORDTM_CARE_PSNCPA_CO: 35.0,
  UPDT_DT: "2026-10-15 11:42:58.0",
};

// 서울시 유치원 일반현황(childSchoolInfo) 실제 행 모양
const kg = {
  KDGT_CD: "16f86a3d-1aa1-471d-bcd4-a563853f8658",
  KDGT_NM: "서울신구유치원",
  FNDN_TYPE: "공립(단설)",
  ADDR: "서울특별시 강남구 압구정로14길 21",
  TELNO: "02-3446-7480",
  HMPG: "http://서울신구유치원.kr/",
  OPER_HR: "07시30분~19시30분",
  AGE_3_CLAS_CNT: "1",
  AGE_4_CLAS_CNT: "2",
  AGE_5_CLAS_CNT: "0",
  MIX_CLAS_CNT: "0",
  AGE_3_TDL_CNT: "14",
  AGE_4_TDL_CNT: "24",
  AGE_5_TDL_CNT: "0",
  MIX_TDL_CNT: "0",
  SPCL_TDL_CNT: "4",
  PBLNT_CYCL: "20262",
};

describe("서울시 돌봄시설 현황 (지역아동센터·키움센터)", () => {
  it("좌표·학기 중 평일·토요일 운영시간·정원을 같은 시설 스키마로 바꾼다 (현원이 없어 빈자리는 모름)", () => {
    const f = normalizeCareCenter(kium, "kiumcenter", "seoul-kiumcenter")!;
    expect(f).toMatchObject({
      id: "kiumcenter:SC260901",
      kind: "kiumcenter",
      capacity: 35,
      enrolled: null,
      vacancy: null,
      hours: { weekday: { open: "13:00", close: "20:00" }, sat: { open: "09:00", close: "15:00" } },
      extended: { weekend: true },
      asOf: "2026-10-15",
    });
    expect(f.address).toContain("118동");
    expect(f.ageOpen.slice(6)).toEqual([true, true, true]);
    expect(f.ageOpen.slice(0, 6).some(Boolean)).toBe(false);
    expect(availability(f).label).toContain("정원 35명");
  });

  it("운영시간으로 시간대를 '확인됨'으로 판정하고, 운영 안 하는 요일·시간은 뺀다", () => {
    const f = normalizeCareCenter(kium, "kiumcenter", "x")!;
    expect(coversHours(f, { day: "weekday", start: "14:00", end: "19:30" })).toMatchObject({ confidence: "confirmed" });
    expect(coversHours(f, { day: "weekday", start: "09:00", end: "12:00" })).toBeNull();
    expect(coversHours(f, { day: "sat", start: "10:00", end: "14:00" })).toMatchObject({ confidence: "confirmed" });
    expect(coversHours(f, { day: "sun", start: "10:00", end: "14:00" })).toBeNull();
  });

  it("토요일 미운영·정원 없음·좌표 없음·이상한 시각을 처리한다", () => {
    const f = normalizeCareCenter({ ...kium, SAT_OPER_AT: "N", ORDTM_CARE_PSNCPA_CO: undefined }, "localcenter", "x")!;
    expect(f.hours).toEqual({ weekday: { open: "13:00", close: "20:00" } });
    expect(f.capacity).toBeNull();
    expect(normalizeCareCenter({ ...kium, Y_CRDNT_VALUE: "" }, "localcenter", "x")).toBeNull();
    expect(hhmm("2500")).toBeNull();
    expect(hhmm("930")).toBe("09:30");
    expect(normalizeCareCenter({ ...kium, AGE_SE_NM: "영유아" }, "localcenter", "x")!.ageOpen.slice(0, 6).every(Boolean)).toBe(true);
  });
});

describe("서울시 유치원 일반현황", () => {
  beforeEach(fresh);

  it("운영시간 문자열을 읽는다", () => {
    expect(parseOperHours("07시30분~19시30분")).toEqual({ open: "07:30", close: "19:30" });
    expect(parseOperHours("9시~17시")).toEqual({ open: "09:00", close: "17:00" });
    expect(parseOperHours("")).toBeNull();
  });

  it("개설된 반의 연령만 열고, 원아 수를 현원으로, 정원은 모름(빈자리 없음)", () => {
    const f = normalizeKindergarten(kg, { lat: 37.523, lng: 127.0235 })!;
    expect(f.ageOpen.slice(3, 6)).toEqual([true, true, false]);
    expect(f).toMatchObject({ kind: "kindergarten", type: "공립(단설)", enrolled: 42, capacity: null, vacancy: null, hours: { weekday: { open: "07:30", close: "19:30" } } });
    expect(normalizeKindergarten({ ...kg, MIX_CLAS_CNT: "1" }, { lat: 37.5, lng: 127 })!.ageOpen.slice(3, 6)).toEqual([true, true, true]);
  });

  it("주소 좌표는 한 번만 묻고 저장해 둔다 (못 찾은 주소도 저장, 일시 오류는 저장 안 함)", async () => {
    let calls = 0;
    const geo = async (a: string) => {
      calls++;
      if (a.includes("오류")) throw new Error("kakao 500");
      return a.includes("없는") ? null : { lat: 37.5, lng: 127.0 };
    };
    const first = await geocodeAll(["가 주소", "가 주소", "없는 주소", "오류 주소"], geo);
    expect(first.get("가 주소")).toEqual({ lat: 37.5, lng: 127.0 });
    expect(first.get("없는 주소")).toBeNull();
    expect(calls).toBe(3);
    calls = 0;
    await geocodeAll(["가 주소", "없는 주소", "오류 주소"], geo);
    expect(calls).toBe(1); // 오류 났던 주소만 다시 묻는다
    expect(await store().list("geocodes")).toHaveLength(2);
  });

  it("수집: 오래된 공시는 빼고, 좌표를 붙여 행정동과 함께 저장한다", async () => {
    process.env.SEOUL_OPEN_API_KEY = "k";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ childSchoolInfo: { list_total_count: 2, row: [kg, { ...kg, KDGT_CD: "old", PBLNT_CYCL: "20182" }] } }))) as typeof fetch;
    try {
      const r = await syncFacilities([seoulKindergartenSource(async () => ({ lat: 37.523, lng: 127.0235 }))]);
      expect(r.total).toBe(1);
      const { facilities } = await facilitiesInBounds({ swLat: 37.5, swLng: 127.0, neLat: 37.55, neLng: 127.05 });
      expect(facilities[0]).toMatchObject({ id: `kg:${kg.KDGT_CD}`, sigunguCode: "11680" });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.SEOUL_OPEN_API_KEY;
    }
  });
});
