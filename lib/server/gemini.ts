// Gemini (Vertex AI) 호출. Cloud Functions 의 기본 서비스 계정 권한으로 부르므로 API 키가 필요 없다.
// LLM 호출은 서버에서만 한다. 테스트에서는 setGenerateForTests 로 가짜를 끼운다.
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { projectId } from "@/lib/firebaseAdmin";
import { isDeployed } from "./env";
import { HttpError } from "./http";

/** 기본 모델. AGENT_MODEL 로 바꿀 수 있다 (2026-11 이 프로젝트에서 호출 확인: gemini-3.8-flash, global) */
export const GEMINI_MODEL = () => process.env.AGENT_MODEL || "gemini-3.8-flash";
const LOCATION = () => process.env.GEMINI_LOCATION || "global";

export type Generate = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

let override: Generate | null = null;
export function setGenerateForTests(fn: Generate | null) {
  override = fn;
}

let ai: GoogleGenAI | null = null;

/** 에뮬레이터·로컬에서는 Google 자격 증명(ADC)을 명시적으로 켰을 때만 Vertex AI 를 부른다 */
function client(): GoogleGenAI {
  if (!isDeployed() && !process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GEMINI_LOCAL !== "on") {
    throw new HttpError(503, "AI 상담은 배포된 환경에서만 동작해요 (로컬은 GEMINI_LOCAL=on + Google 인증 필요)");
  }
  ai ??= new GoogleGenAI({ enterprise: true, project: projectId(), location: LOCATION() });
  return ai;
}

export function generate(): Generate {
  if (override) return override;
  const c = client();
  return (params) => c.models.generateContent(params);
}

// --- 임베딩 (RAG 검색용) ---

/** 2026-11 이 프로젝트에서 호출 확인: gemini-embedding-2 (global, embedContent) */
export const EMBED_MODEL = () => process.env.EMBED_MODEL || "gemini-embedding-2";
export const EMBED_DIM = 768;

export type Embed = (texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") => Promise<number[][]>;

let embedOverride: Embed | null = null;
export function setEmbedForTests(fn: Embed | null) {
  embedOverride = fn;
}

export function embed(): Embed {
  if (embedOverride) return embedOverride;
  const c = client();
  return async (texts, task) => {
    const out: number[][] = [];
    // 한 번에 하나씩 (Vertex 의 gemini 임베딩은 요청당 입력 하나), 동시 4개
    for (let i = 0; i < texts.length; i += 4) {
      const batch = await Promise.all(
        texts.slice(i, i + 4).map(async (t) => {
          const r = await c.models.embedContent({
            model: EMBED_MODEL(),
            contents: t,
            config: { taskType: task, outputDimensionality: EMBED_DIM },
          });
          const v = r.embeddings?.[0]?.values;
          if (!v?.length) throw new Error("embedding failed");
          return v;
        }),
      );
      out.push(...batch);
    }
    return out;
  };
}
