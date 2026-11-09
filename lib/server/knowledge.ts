// AI 상담의 지식 검색(RAG). 큐레이션 문서(content/apply-guides, content/knowledge)를 섹션 단위로 나눠
// Gemini 임베딩으로 색인하고, 질문과 가까운 조각을 출처·기준일·경과일과 함께 돌려준다.
//
// 색인은 Firestore knowledge_chunks 에 둔다. 문서 내용이 바뀌면(해시가 다르면) 첫 검색 때 다시 만든다
// — 문서를 고치고 배포하면 따로 색인 작업을 돌릴 필요가 없다. 조각 수가 적어(수백 개 이하) 검색은 메모리에서 코사인 유사도로 한다.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseGuide } from "@/lib/applyGuide";
import type { FacilityKind } from "@/lib/types";
import { EMBED_MODEL, embed } from "./gemini";
import { store } from "./store";

export const CHUNKS = "knowledge_chunks";
const META = "knowledge_meta";
/** 기준일이 이 일수를 넘으면 '오래된 자료' 로 표시한다 */
export const STALE_DAYS = 365;
const CACHE_MS = 10 * 60_000;

export interface ChunkBase {
  doc_id: string;
  title: string;
  section: string;
  text: string;
  source: string;
  source_url: string;
  as_of: string;
  reviewed: boolean;
  kinds: FacilityKind[];
  sigungu_code: string | null;
}

export type Chunk = ChunkBase & { embedding: number[]; [k: string]: unknown };

const ROOTS = ["content/apply-guides", "content/knowledge"];

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full);
    return e.name.endsWith(".md") && !e.name.startsWith("_") && e.name !== "README.md" ? [full] : [];
  });
}

/** 문서 → 섹션(## 제목) 단위 조각. 조각 앞에 문서 제목·섹션명을 붙여 검색이 잘 되게 한다 */
export function chunkDocuments(cwd = process.cwd()): ChunkBase[] {
  const files = ROOTS.flatMap((r) => listFiles(path.join(cwd, r))).sort();
  return files.flatMap((file) => {
    const g = parseGuide(fs.readFileSync(file, "utf8"), path.basename(file, ".md"));
    // 서류의 'when: 우선순위ID' 를 '(해당: 우선순위 이름)' 으로 바꿔 AI 가 어떤 상황의 서류인지 알게 한다
    const label = new Map(g.priorities.map((p) => [p.id, p.text]));
    const readable = (body: string) =>
      body
        .replace(/\s*\|\s*when:\s*(.+)$/gm, (_, ids: string) => ` (해당: ${ids.split(",").map((x) => label.get(x.trim()) ?? x.trim()).join(", ")})`)
        .replace(/\{[\w-]+\}\s*/g, "");
    const sections = g.body.split(/^##\s+/m).map((s) => s.trim()).filter(Boolean);
    return sections.map((sec) => {
      const [head, ...rest] = sec.split("\n");
      return {
        doc_id: g.sigunguCode ? `sigungu-${g.sigunguCode}` : g.id,
        title: g.title,
        section: head.trim(),
        text: `${g.title} — ${head.trim()}\n${readable(rest.join("\n")).trim()}`,
        source: g.source,
        source_url: g.sourceUrl,
        as_of: g.asOf,
        reviewed: g.reviewed,
        kinds: g.kinds,
        sigungu_code: g.sigunguCode,
      };
    });
  });
}

const chunkId = (c: ChunkBase) => createHash("sha1").update(`${c.doc_id}|${c.section}`).digest("hex").slice(0, 20);

let cache: { at: number; chunks: Chunk[] } | null = null;
let indexing: Promise<Chunk[]> | null = null;

/** 문서가 바뀌었으면 다시 색인하고, 색인된 조각을 돌려준다 */
export async function ensureIndex(now = Date.now()): Promise<Chunk[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.chunks;
  indexing ??= (async () => {
    const docs = chunkDocuments();
    const hash = createHash("sha256").update(EMBED_MODEL()).update(JSON.stringify(docs)).digest("hex");
    const meta = await store().get<{ hash: string }>(META, "index");
    let chunks: Chunk[];
    if (meta?.hash === hash) {
      chunks = await store().list<Chunk>(CHUNKS);
    } else {
      const vectors = await embed()(docs.map((d) => d.text), "RETRIEVAL_DOCUMENT");
      chunks = docs.map((d, i) => ({ ...d, embedding: vectors[i] }));
      const keep = new Set(chunks.map(chunkId));
      for (const old of await store().list<Chunk>(CHUNKS)) if (!keep.has(old.id)) await store().delete(CHUNKS, old.id);
      await store().setMany(CHUNKS, chunks.map((c) => [chunkId(c), c] as [string, Chunk]));
      await store().set(META, "index", { hash, model: EMBED_MODEL(), count: chunks.length, indexed_at: new Date(now).toISOString() });
    }
    cache = { at: now, chunks };
    return chunks;
  })().finally(() => {
    indexing = null;
  });
  return indexing;
}

export function resetKnowledgeCacheForTests() {
  cache = null;
  indexing = null;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

export interface KnowledgeHit {
  title: string;
  section: string;
  text: string;
  source: string;
  source_url: string;
  as_of: string;
  /** 오늘 기준 경과 일수. 기준일을 모르면 null */
  age_days: number | null;
  /** 기준일이 STALE_DAYS 를 넘었거나 모르는 자료 */
  stale: boolean;
  reviewed: boolean;
  score: number;
}

/**
 * 질문과 가까운 조각. 시설 종류를 주면 그 종류 문서만, 구 코드를 주면 그 구 문서와 공통 문서만 본다.
 */
export async function searchKnowledge(
  query: string,
  opts: { kind?: FacilityKind; sigunguCode?: string | null; k?: number; now?: Date } = {},
): Promise<KnowledgeHit[]> {
  const chunks = await ensureIndex();
  const [q] = await embed()([query], "RETRIEVAL_QUERY");
  const now = opts.now ?? new Date();
  return chunks
    .filter((c) => (!opts.kind || c.kinds.length === 0 || c.kinds.includes(opts.kind)) && (!c.sigungu_code || c.sigungu_code === opts.sigunguCode))
    .map((c) => {
      const asOf = Date.parse(c.as_of);
      const age = Number.isNaN(asOf) ? null : Math.floor((now.getTime() - asOf) / 86_400_000);
      return {
        title: c.title,
        section: c.section,
        text: c.text,
        source: c.source,
        source_url: c.source_url,
        as_of: c.as_of,
        age_days: age,
        stale: age === null || age > STALE_DAYS,
        reviewed: c.reviewed,
        score: Math.round(cosine(q, c.embedding) * 1000) / 1000,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k ?? 5);
}
