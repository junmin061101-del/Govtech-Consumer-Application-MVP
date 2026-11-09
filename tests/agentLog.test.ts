import type { Content, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAgentSummaries,
  dashSlots,
  dashTarget,
  extractTurn,
  INSIGHTS,
  LOGS,
  recordTurn,
  scrub,
  SUMMARIES,
  SUMMARY_MIN,
  topicsOf,
} from "@/lib/server/agentLog";
import { setGenerateForTests } from "@/lib/server/gemini";
import { store } from "@/lib/server/store";
import { signup, updateProfile, withdraw } from "@/lib/server/users";
import { fresh } from "./helpers";

const DONG = "1159051000"; // 동작구 노량진1동
const consents = (aiLog: boolean) => ({ terms: true, privacy: true, age14: true, notify: false, aiLog });

/** 앱이 보내는 것과 같은 모양의 한 건: 질문 → 시설 검색 도구 → 결과 0곳 → 답 */
const convo = (question: string, matchCount = 0): Content[] => [
  { role: "user", parts: [{ text: `[오늘 2026-11-09(월) · 현재 위치: 동작구 노량진1동 (행정동 ${DONG}, 대략 좌표 37.513,126.943)]\n${question}` }] },
  {
    role: "model",
    parts: [{ functionCall: { id: "c1", name: "search_facilities", args: { emd_code: DONG, day: "weekday", start: "18:00", end: "21:00", age: 2 } } }],
  },
  { role: "user", parts: [{ functionResponse: { id: "c1", name: "search_facilities", response: { match_count: matchCount, matches: [] } } }] },
  { role: "model", parts: [{ text: "조건에 맞는 곳을 찾지 못했어요. 범위를 넓혀 볼까요?" }] },
];

describe("대시보드 코드 맞추기", () => {
  it("시간대는 대시보드 구분(이른 아침·주간·방과후·야간·주말)으로 바꾼다", () => {
    expect(dashSlots("weekday", "09:00", "18:00")).toEqual(["daytime", "after_school"]);
    expect(dashSlots("weekday", "18:00", "21:00")).toEqual(["after_school", "night"]);
    expect(dashSlots("weekday", "07:30", "09:00")).toEqual(["early_morning"]);
    expect(dashSlots("sat", "10:00", "15:00")).toEqual(["weekend"]);
  });
  it("대상은 영유아(0~5세)·초등 저학년(6~9세)", () => {
    expect(dashTarget(0)).toBe("infant");
    expect(dashTarget(5)).toBe("infant");
    expect(dashTarget(7)).toBe("lower_elementary");
    expect(dashTarget(null)).toBeNull();
  });
});

describe("개인정보 가림", () => {
  it("전화번호·이메일·주민번호·상세 주소·아이 이름을 가린다", () => {
    const t = scrub("연락 010-1234-5678, a@b.com, 900101-1234567, 101동 1203호 살고 우리 아이 이름은 김지우예요");
    expect(t).not.toMatch(/1234-5678|a@b\.com|1234567|1203호|김지우/);
    expect(t).toContain("[전화번호]");
    expect(t).toContain("[이름]");
  });
});

describe("AI 상담 기록", () => {
  beforeEach(fresh);
  afterEach(() => setGenerateForTests(null));

  it("한 건을 뽑는다: 질문(앱 정보 줄 제외)·위치·시간·도구·결과", () => {
    const t = extractTurn(convo("저녁 9시까지 맡길 곳 있어?"))!;
    expect(t.question).toBe("저녁 9시까지 맡길 곳 있어?");
    expect(t).toMatchObject({ emdCode: DONG, day: "weekday", start: "18:00", end: "21:00", age: 2, facilityMatches: 0 });
    expect(topicsOf(t)).toEqual(expect.arrayContaining(["facility_search", "hours"]));
  });

  it("동의 안 한 회원: 익명 기록만 남고 대화 원문·회원 식별자는 어디에도 없다", async () => {
    await signup("u-no", { consents: consents(false), children: [{ months: 30 }], interestDongs: [DONG] });
    const r = await recordTurn("u-no", convo("저녁 9시까지 맡길 곳 있어? 제 번호 010-1111-2222"));
    expect(r).toMatchObject({ logged: false });
    expect(await store().list(LOGS)).toHaveLength(0);
    const [ins] = await store().list(INSIGHTS);
    expect(ins).toMatchObject({ sigunguCode: "11590", emdCode: DONG, timeSlots: ["after_school", "night"], target: "infant", outcome: { noResult: true } });
    expect(JSON.stringify(ins)).not.toMatch(/u-no|맡길 곳|010/);
  });

  it("동의한 회원: 가림 처리한 대화 로그를 90일 보관으로 남기고, uid 대신 가명 키만 둔다", async () => {
    await signup("u-yes", { consents: consents(true), children: [{ months: 30 }], interestDongs: [DONG] });
    await recordTurn("u-yes", convo("우리 아이 이름은 김지우인데 저녁 9시까지 맡길 곳 있어? 010-1111-2222"));
    const [log] = await store().list<Record<string, unknown>>(LOGS);
    expect(log.question).toContain("[이름]");
    expect(log.question).toContain("[전화번호]");
    expect(String(log.answer)).toContain("찾지 못했어요");
    expect(JSON.stringify(log)).not.toMatch(/u-yes|김지우|1111-2222/);
    const days = ((log.expiresAt as Date).getTime() - (log.createdAt as Date).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it("동의를 끄거나 탈퇴하면 그 회원의 대화 로그를 바로 지운다 (익명 기록은 남는다)", async () => {
    await signup("u-a", { consents: consents(true), children: [{ months: 30 }], interestDongs: [DONG] });
    await signup("u-b", { consents: consents(true), children: [{ months: 30 }], interestDongs: [DONG] });
    await recordTurn("u-a", convo("맡길 곳?"));
    await recordTurn("u-b", convo("맡길 곳?"));
    await updateProfile("u-a", { aiLog: false });
    expect(await store().list(LOGS)).toHaveLength(1);
    await withdraw("u-b");
    expect(await store().list(LOGS)).toHaveLength(0);
    expect(await store().list(INSIGHTS)).toHaveLength(2);
  });

  it("매일 구별 집계를 만들고, 표본이 충분하면 Gemini 요약을 붙인다 (표본 적은 동 요약은 뺀다)", async () => {
    await signup("u-s", { consents: consents(true), children: [{ months: 30 }], interestDongs: [DONG] });
    for (let i = 0; i < SUMMARY_MIN; i++) await recordTurn("u-s", convo(`저녁 돌봄 문의 ${i}`));
    const seen: GenerateContentParameters[] = [];
    setGenerateForTests(async (p) => {
      seen.push(p);
      return {
        text: JSON.stringify({
          district: "노량진1동 평일 저녁 문의가 많고 모두 결과 없음이었습니다.",
          dongs: [
            { emdCode: DONG, summary: "저녁 시간 돌봄 문의 집중" },
            { emdCode: "1159052000", summary: "표본 없는 동" },
          ],
        }),
      } as unknown as GenerateContentResponse;
    });
    expect(await buildAgentSummaries()).toEqual(["11590"]);
    const s = await store().get<Record<string, any>>(SUMMARIES, "11590");
    expect(s!.total).toMatchObject({ count: SUMMARY_MIN, noResult: SUMMARY_MIN });
    expect(s!.byDong[DONG].bySlot).toMatchObject({ after_school: SUMMARY_MIN, night: SUMMARY_MIN });
    expect(s!.summary).toContain("노량진1동");
    expect(s!.dongSummaries).toEqual({ [DONG]: "저녁 시간 돌봄 문의 집중" });
    // 요약 입력에는 가림 처리된 질문만 들어간다 (uid 없음)
    expect(JSON.stringify(seen[0].contents)).not.toContain("u-s");
  });
});
