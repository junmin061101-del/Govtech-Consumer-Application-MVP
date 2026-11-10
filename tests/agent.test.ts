import type { Content, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as agentRoute from "@/server/api/agent/route";
import { agentStep, runTool, SYSTEM, TOOLS, validateHistory } from "@/lib/server/agent";
import { setEmbedForTests, setGenerateForTests } from "@/lib/server/gemini";
import { resetKnowledgeCacheForTests } from "@/lib/server/knowledge";
import { listAlerts } from "@/lib/server/alerts";
import { EVENTS, type DemandEvent } from "@/lib/server/events";
import { FACILITIES, locate } from "@/lib/server/facilities";
import { store } from "@/lib/server/store";
import { signup } from "@/lib/server/users";
import { normalizeRow } from "@/lib/normalize";
import { fresh, NORYANGJIN, req } from "./helpers";

const UID = "dev:agent";

/** 테스트용 임베딩: 글자 bigram 해시 → 64차원. 비슷한 글은 가깝게 나온다 */
const fakeEmbed = async (texts: string[]) =>
  texts.map((t) => {
    const v = new Array(64).fill(0);
    const s = t.replace(/\s+/g, "");
    for (let i = 0; i < s.length - 1; i++) v[(s.charCodeAt(i) * 31 + s.charCodeAt(i + 1)) % 64] += 1;
    return v;
  });
const DONG = "1159051000"; // 노량진1동

type Params = GenerateContentParameters;
const reply = (parts: unknown[]) => ({ candidates: [{ content: { role: "model", parts } }] }) as unknown as GenerateContentResponse;

async function seed() {
  await signup(UID, { consents: { terms: true, privacy: true, age14: true, notify: false }, children: [{ months: 30 }], interestDongs: [DONG] });
  const f = normalizeRow({ STCODE: "fac1", CRNAME: "햇살어린이집", CRSTATUSNAME: "정상", CRCAPAT: "20", CRCHCNT: "15", LA: String(NORYANGJIN.lat), LO: String(NORYANGJIN.lng), CLASS_CNT_02: 1, DATASTDRDT: new Date().toISOString().slice(0, 10) })!;
  const s = locate(f, new Date().toISOString())!;
  await store().set(FACILITIES, s.id, s);
}

describe("AI 상담 에이전트", () => {
  const calls: Params[] = [];
  beforeEach(async () => {
    fresh();
    calls.length = 0;
    await seed();
  });
  afterEach(() => {
    setGenerateForTests(null);
    setEmbedForTests(null);
    resetKnowledgeCacheForTests();
  });

  it("도구를 쓰면 실행 결과를 붙여 done=false, 다음 호출에서 답을 내면 done=true", async () => {
    const replies = [
      reply([
        {
          functionCall: { id: "t1", name: "search_facilities", args: { emd_code: DONG, age: 2, day: "weekday", start: "09:00", end: "17:00" } },
          thoughtSignature: "sig-1",
        },
      ]),
      reply([{ text: "햇살어린이집이 있어요." }]),
    ];
    setGenerateForTests(async (p) => {
      calls.push(p);
      return replies.shift()!;
    });

    let history: Content[] = [{ role: "user", parts: [{ text: "노량진에서 평일 낮에 만 2세" }] }];
    const s1 = await agentStep(UID, history);
    expect(s1.done).toBe(false);
    expect(s1.tools).toEqual(["search_facilities"]);
    // 모델 응답은 thoughtSignature 까지 그대로 남긴다
    expect(s1.append[0].parts![0].thoughtSignature).toBe("sig-1");
    const fr = s1.append[1].parts![0].functionResponse!;
    expect(fr).toMatchObject({ id: "t1", name: "search_facilities" });
    expect(fr.response).toMatchObject({ match_count: 1, matches: [{ name: "햇살어린이집", status: "이용 가능" }] });

    history = [...history, ...s1.append];
    const s2 = await agentStep(UID, history);
    expect(s2.done).toBe(true);
    // 기록은 덧붙이기만 하고, 시스템 지시·도구 목록은 호출마다 같다
    expect(calls[1].contents).toEqual(history);
    expect(calls[0].config?.systemInstruction).toBe(SYSTEM);
    expect(calls[1].config?.tools).toEqual([{ functionDeclarations: TOOLS }]);
    expect(calls[0].model).toBe("gemini-3.8-flash");

    // 에이전트 검색도 통계 이벤트로 남는다 (개인정보 없이)
    const [ev] = await store().list<DemandEvent>(EVENTS);
    expect(ev).toMatchObject({ event_type: "search_result", emd_code: DONG, target: "infant" });
  });

  it("빈자리 알림 도구는 실제로 등록하고, 한도를 넘으면 오류를 결과로 돌려준다", async () => {
    for (let i = 0; i < 3; i++) {
      const r = (await runTool(UID, "create_vacancy_alert", { type: "facility", facility_id: `f${i}`, facility_name: `시설${i}` })) as { ok: boolean };
      expect(r.ok).toBe(true);
    }
    const over = (await runTool(UID, "create_vacancy_alert", { type: "facility", facility_id: "f9", facility_name: "x" })) as { ok: boolean; error: string };
    expect(over).toMatchObject({ ok: false });
    expect(over.error).toMatch(/3개/);
    expect(await listAlerts(UID)).toHaveLength(3);
  });

  it("동네 이름 → 행정동, 프로필 읽기", async () => {
    const d = (await runTool(UID, "find_dong", { query: "노량진" })) as { matches: { emd_code: string; name: string }[] };
    expect(d.matches.map((m) => m.emd_code)).toContain(DONG);
    const p = (await runTool(UID, "get_my_profile", {})) as { children: { age_years: number }[]; interest_dongs: { name: string }[] };
    expect(p.children[0].age_years).toBe(2);
    expect(p.interest_dongs[0].name).toBe("동작구 노량진1동");
  });

  it("신청 안내는 지식 검색(RAG)으로 출처·기준일·검수 여부와 함께 돌려준다", async () => {
    setEmbedForTests(fakeEmbed);
    resetKnowledgeCacheForTests();
    const r = (await runTool(UID, "search_knowledge", { query: "어린이집 신청 창구 아이사랑", kind: "daycare" })) as {
      today: string;
      results: { title: string; source_url: string; as_of: string; reviewed: boolean; stale: boolean }[];
    };
    expect(r.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0]).toMatchObject({ title: "어린이집 입소 신청 안내", source_url: "https://www.childcare.go.kr", reviewed: false });
  });

  it("빈 응답이면 안내 문장으로 끝낸다 (다음 요청이 깨지지 않게)", async () => {
    setGenerateForTests(async () => ({ candidates: [] }) as unknown as GenerateContentResponse);
    const s = await agentStep(UID, [{ role: "user", parts: [{ text: "?" }] }]);
    expect(s).toMatchObject({ done: true, append: [{ role: "model" }] });
    expect(s.append[0].parts![0].text).toBeTruthy();
  });

  it("기록 형식 검사: 첫·마지막은 user, 너무 길면 새 대화", () => {
    const u = { role: "user", parts: [{ text: "x" }] };
    expect(() => validateHistory([])).toThrow();
    expect(() => validateHistory([{ role: "model", parts: [{ text: "x" }] }])).toThrow();
    expect(() => validateHistory([{ role: "system", parts: [{ text: "x" }] }])).toThrow();
    expect(() => validateHistory([{ role: "user", parts: [] }])).toThrow();
    expect(() => validateHistory(Array.from({ length: 81 }, () => u))).toThrow(/새 대화/);
    expect(validateHistory([u])).toHaveLength(1);
  });

  it("API: 회원만, 로컬(배포 전)에서는 503 으로 안내", async () => {
    const body = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };
    expect((await agentRoute.POST(req("/api/agent", { json: body }))).status).toBe(401);
    expect((await agentRoute.POST(req("/api/agent", { uid: UID, json: body }))).status).toBe(503);
  });
});
