import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setEmbedForTests } from "@/lib/server/gemini";
import { CHUNKS, chunkDocuments, ensureIndex, resetKnowledgeCacheForTests, searchKnowledge, STALE_DAYS } from "@/lib/server/knowledge";
import { store } from "@/lib/server/store";
import { fresh } from "./helpers";

let calls = 0;
const fakeEmbed = async (texts: string[]) => {
  calls += texts.length;
  return texts.map((t) => {
    const v = new Array(64).fill(0);
    const s = t.replace(/\s+/g, "");
    for (let i = 0; i < s.length - 1; i++) v[(s.charCodeAt(i) * 31 + s.charCodeAt(i + 1)) % 64] += 1;
    return v;
  });
};

describe("지식 검색 (RAG)", () => {
  beforeEach(() => {
    fresh();
    calls = 0;
    resetKnowledgeCacheForTests();
    setEmbedForTests(fakeEmbed);
  });
  afterEach(() => setEmbedForTests(null));

  it("안내 문서를 섹션 단위로 나누고, 출처·기준일·검수 여부를 붙인다 (템플릿·README 제외)", () => {
    const chunks = chunkDocuments();
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((c) => c.source && c.as_of)).toBe(true);
    expect(chunks.some((c) => c.doc_id === "careos-data" && c.reviewed)).toBe(true);
    expect(chunks.some((c) => c.title.includes("OO구"))).toBe(false);
    // 지침 문서의 {항목ID}·when 표시는 읽을 수 있는 말로 바꾼다
    expect(chunks.some((c) => /\{p_|when:/.test(c.text))).toBe(false);
    const docs = chunks.find((c) => c.doc_id === "daycare" && c.section === "필요 서류")!;
    expect(docs.text).toContain("부모 각각의 재직 또는 사업 증빙 (해당: 맞벌이 가구)");
  });

  it("처음 한 번만 색인하고, 문서가 그대로면 다시 임베딩하지 않는다", async () => {
    const first = await ensureIndex();
    const n = calls;
    expect(n).toBe(first.length);
    expect((await store().list(CHUNKS)).length).toBe(first.length);
    resetKnowledgeCacheForTests();
    await ensureIndex();
    expect(calls).toBe(n);
  });

  it("질문과 가까운 조각을 찾고, 기준일이 오래되면 stale 로 표시한다", async () => {
    const hits = await searchKnowledge("어린이집 맞벌이 재직 증빙 서류", { kind: "daycare" });
    expect(hits[0].title).toBe("어린이집 입소 신청 안내");
    expect(hits.every((h) => h.age_days !== null && h.stale === false)).toBe(true);
    const later = await searchKnowledge("어린이집 서류", { kind: "daycare", now: new Date(Date.now() + (STALE_DAYS + 30) * 86_400_000) });
    expect(later.every((h) => h.stale)).toBe(true);
  });

  it("시설 종류로 좁히면 다른 종류 문서는 나오지 않는다", async () => {
    const hits = await searchKnowledge("신청", { kind: "kindergarten", k: 20 });
    expect(hits.some((h) => h.title === "어린이집 입소 신청 안내")).toBe(false);
    expect(hits.some((h) => h.title === "유치원 입학 신청 안내")).toBe(true);
  });
});
