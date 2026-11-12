// AI 상담 → 구청 대시보드 연동.
// - agentInsights: 모든 상담 한 건마다 익명 구조화 기록 (행정동·시간대·대상·주제·결과). 원문·회원 식별 정보 없음. 대시보드가 자기 구 것을 실시간으로 집계한다.
// - agentLogs: '대화 내용 수집' 에 동의한 회원의 질문·답변 원문 (개인정보 패턴 가림, 90일 뒤 자동 삭제). 대시보드가 자기 구 것만 읽는다.
// - agentSummaries/{구}: 매일 작업이 최근 30일 기록을 집계하고 Gemini 가 요약한 결과. 대시보드가 읽는다.
// 시간대·대상 코드는 대시보드(Govtech-Idea-MVP src/lib/constants)와 같다.
import type { Content, Part } from "@google/genai";
import { AI_LOG_RETENTION_DAYS, ageYears, currentMonths, type Profile } from "@/lib/profile";
import type { Day } from "@/lib/types";
import { pkeyFor } from "./events";
import { GEMINI_MODEL, generate } from "./gemini";
import { dongByCode, isKnownDong } from "./regions";
import { store } from "./store";
import { getProfile } from "./users";

export const INSIGHTS = "agentInsights";
export const LOGS = "agentLogs";
export const SUMMARIES = "agentSummaries";

/** 대시보드 시간대 코드 */
export type DashSlot = "early_morning" | "daytime" | "after_school" | "night" | "weekend" | "vacation";
export type DashTarget = "infant" | "lower_elementary";

const HOURS: [DashSlot, number, number][] = [
  ["early_morning", 7 * 60, 9 * 60],
  ["daytime", 9 * 60, 17 * 60],
  ["after_school", 17 * 60, 19 * 60],
  ["night", 19 * 60, 22 * 60],
];
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** 요청 시간대가 걸치는 대시보드 시간대들 */
export function dashSlots(day: Day, start: string, end: string): DashSlot[] {
  if (day !== "weekday") return ["weekend"];
  const s = toMin(start);
  const e = toMin(end);
  return HOURS.filter(([, a, b]) => s < b && e > a).map(([id]) => id);
}

/** 만 0~5세 영유아, 6~9세 초등 저학년 (대시보드 기준) */
export const dashTarget = (age: number | null): DashTarget | null =>
  age === null ? null : age <= 5 ? "infant" : age <= 9 ? "lower_elementary" : null;

// --- 개인정보 가림 ---

const MASKS: [RegExp, string][] = [
  [/01[016789][\s.\-)]*\d{3,4}[\s.\-]*\d{4}/g, "[전화번호]"],
  [/\b0\d{1,2}[\s.\-)]+\d{3,4}[\s.\-]+\d{4}\b/g, "[전화번호]"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[이메일]"],
  [/\d{6}\s*-\s*[1-4]\d{6}/g, "[주민번호]"],
  [/\d{1,4}\s*동\s*\d{1,4}\s*호/g, "[상세주소]"],
  [/\d+(-\d+)?\s*번지/g, "[상세주소]"],
  [/((아이|우리\s*애|애기|아기|딸|아들|첫째|둘째|셋째)\s*(의\s*)?이름(은|이|:)?\s*)[가-힣]{2,4}/g, "$1[이름]"],
  [/(이름(은|이)\s*)[가-힣]{2,4}(?=(이고|이에요|예요|입니다|이야))/g, "$1[이름]"],
];

export function scrub(text: string): string {
  return MASKS.reduce((t, [re, rep]) => t.replace(re, rep), text.normalize("NFC"));
}

// --- 대화 한 건 추출 ---

const CONTEXT_RE = /^\[오늘 [^\]]*\]\n?/;

interface Turn {
  question: string;
  answer: string;
  emdCode: string | null;
  day: Day | null;
  start: string | null;
  end: string | null;
  age: number | null;
  tools: string[];
  facilityMatches: number | null;
  knowledgeHits: number | null;
  staleDocs: boolean;
}

// 확장 프로그램이 붙인 '[아이사랑 화면 정보]'(부모가 보던 화면 요약)는 부모의 질문이 아니므로 기록에서 뺀다
const textOf = (parts: Part[] = []) =>
  parts.map((p) => (p.thought || /^\[아이사랑 화면 정보\]/.test(p.text ?? "") ? "" : (p.text ?? ""))).join("").trim();

/** 마지막 사용자 질문부터 이번 답까지를 한 건으로 묶는다 */
export function extractTurn(history: Content[]): Turn | null {
  let qi = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const c = history[i];
    if (c.role === "user" && (c.parts ?? []).some((p) => typeof p.text === "string" && p.text.trim())) {
      qi = i;
      break;
    }
  }
  if (qi < 0) return null;
  const raw = textOf(history[qi].parts);
  const ctxEmd = raw.match(/행정동 (\d{10})/)?.[1] ?? null;
  const turn: Turn = {
    question: raw.replace(CONTEXT_RE, "").trim(),
    answer: "",
    emdCode: ctxEmd && isKnownDong(ctxEmd) ? ctxEmd : null,
    day: null,
    start: null,
    end: null,
    age: null,
    tools: [],
    facilityMatches: null,
    knowledgeHits: null,
    staleDocs: false,
  };
  for (const c of history.slice(qi + 1)) {
    for (const p of c.parts ?? []) {
      const call = p.functionCall;
      if (call?.name) {
        turn.tools.push(call.name);
        const a = (call.args ?? {}) as Record<string, unknown>;
        if (call.name === "search_facilities") {
          if (typeof a.emd_code === "string" && isKnownDong(a.emd_code)) turn.emdCode = a.emd_code;
          if (["weekday", "sat", "sun"].includes(String(a.day))) turn.day = a.day as Day;
          if (typeof a.start === "string") turn.start = a.start;
          if (typeof a.end === "string") turn.end = a.end;
          if (Number.isInteger(a.age)) turn.age = a.age as number;
        }
      }
      const res = p.functionResponse;
      if (res?.name === "search_facilities" && typeof res.response?.match_count === "number") {
        turn.facilityMatches = res.response.match_count as number;
      }
      if (res?.name === "search_knowledge" && Array.isArray(res.response?.results)) {
        const r = res.response.results as { stale?: boolean }[];
        turn.knowledgeHits = r.length;
        turn.staleDocs ||= r.some((x) => x.stale);
      }
    }
    if (c.role === "model") {
      const t = textOf(c.parts);
      if (t) turn.answer = t;
    }
  }
  return turn;
}

// --- 주제 분류 (도구 사용 + 질문 낱말, 추가 LLM 호출 없음) ---

export const TOPICS = {
  facility_search: "시설 찾기",
  vacancy: "빈자리·대기",
  apply_process: "신청 방법",
  documents: "필요 서류",
  priority: "입소 우선순위",
  hours: "운영 시간",
  cost: "비용·지원",
  alert: "빈자리 알림",
  reviews: "후기·평판",
  email: "시설 연락·메일",
  other: "기타",
} as const;
export type Topic = keyof typeof TOPICS;

export function topicsOf(turn: Pick<Turn, "question" | "tools">): Topic[] {
  const q = turn.question;
  const out = new Set<Topic>();
  if (turn.tools.includes("search_facilities") || /찾아|어디|근처|주변|추천/.test(q)) out.add("facility_search");
  if (/빈자리|자리|대기|정원/.test(q)) out.add("vacancy");
  if (/신청|입소|입학|접수|방법|절차/.test(q)) out.add("apply_process");
  if (/서류|증명|준비물|증빙/.test(q)) out.add("documents");
  if (/우선순위|순위|맞벌이|다자녀|한부모|수급|차상위/.test(q)) out.add("priority");
  if (/시간|저녁|야간|아침|주말|토요일|일요일|연장|늦게|일찍/.test(q)) out.add("hours");
  if (/비용|요금|보육료|지원금|수당|무상|돈/.test(q)) out.add("cost");
  if (turn.tools.includes("create_vacancy_alert") || /알림/.test(q)) out.add("alert");
  if (turn.tools.includes("get_review_links") || /후기|리뷰|평판|평가|분위기/.test(q)) out.add("reviews");
  if (turn.tools.includes("draft_email") || /메일|이메일|연락|결석|조퇴/.test(q)) out.add("email");
  if (out.size === 0) out.add("other");
  return [...out];
}

// --- 기록 ---

function childAge(p: Profile | null): number | null {
  const c = p?.children[0];
  return c ? Math.min(9, ageYears(currentMonths(c))) : null;
}

export interface Recorded {
  insightId: string;
  logged: boolean;
}

/** AI 상담 한 건이 끝났을 때 부른다. 실패해도 상담 응답에는 영향을 주지 않게 호출 쪽에서 오류를 삼킨다 */
export async function recordTurn(uid: string, history: Content[], now = new Date()): Promise<Recorded | null> {
  const turn = extractTurn(history);
  if (!turn || !turn.question) return null;
  const profile = await getProfile(uid);
  const emd = turn.emdCode ?? profile?.interestDongs[0] ?? null;
  const d = emd ? dongByCode(emd) : null;
  if (!d) return null; // 지역을 알 수 없으면 구별 대시보드에 넣을 수 없다

  const age = turn.age ?? childAge(profile);
  const slots = turn.day && turn.start && turn.end ? dashSlots(turn.day, turn.start, turn.end) : [];
  const topics = topicsOf(turn);
  const outcome = {
    facilityMatches: turn.facilityMatches,
    noResult: turn.facilityMatches === 0,
    knowledgeHits: turn.knowledgeHits,
    noGuide: turn.knowledgeHits === 0,
    staleDocs: turn.staleDocs,
  };
  const base = {
    sigunguCode: d.sigungu_code,
    emdCode: d.emd_code,
    timeSlots: slots,
    target: dashTarget(age),
    topics,
    tools: [...new Set(turn.tools)],
    outcome,
    createdAt: now,
  };

  const insightId = crypto.randomUUID();
  await store().set(INSIGHTS, insightId, base);

  const consented = Boolean(profile?.consents.aiLog?.agreed);
  if (consented) {
    await store().set(LOGS, crypto.randomUUID(), {
      ...base,
      question: scrub(turn.question).slice(0, 1000),
      answer: scrub(turn.answer).slice(0, 2000),
      // 탈퇴·동의 철회 시 이 회원의 로그를 찾기 위한 가명 키 (uid 원문은 넣지 않는다)
      pkey: await pkeyFor(uid),
      expiresAt: new Date(now.getTime() + AI_LOG_RETENTION_DAYS * 86_400_000),
    });
  }
  return { insightId, logged: consented };
}

/** 동의 철회·탈퇴: 이 회원의 대화 로그를 지운다 */
export async function deleteAgentLogs(uid: string): Promise<number> {
  const pkey = await pkeyFor(uid);
  const logs = await store().list(LOGS, [["pkey", "==", pkey]]);
  for (const l of logs) await store().delete(LOGS, l.id);
  return logs.length;
}

// --- 매일 집계·요약 ---

/** 요약문을 만들 최소 건수 (적으면 숫자만 보여 준다) */
export const SUMMARY_MIN = 5;
const PERIOD_DAYS = 30;

interface DongStat {
  count: number;
  noResult: number;
  topics: Partial<Record<Topic, number>>;
  bySlot: Partial<Record<DashSlot, number>>;
  byTarget: Partial<Record<DashTarget, number>>;
}

/** Firestore Timestamp·Date·문자열 → 밀리초 */
const millis = (v: unknown) =>
  v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate().getTime() : new Date(v as string | Date).getTime();

const bump = <K extends string>(o: Partial<Record<K, number>>, k: K) => {
  o[k] = (o[k] ?? 0) + 1;
};

type InsightDoc = {
  sigunguCode: string;
  emdCode: string;
  timeSlots: DashSlot[];
  target: DashTarget | null;
  topics: Topic[];
  outcome: { noResult: boolean };
  [k: string]: unknown;
};

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    district: { type: "string", description: "구 전체 요약 3~5문장" },
    dongs: {
      type: "array",
      items: {
        type: "object",
        properties: { emdCode: { type: "string" }, summary: { type: "string", description: "그 동 요약 1~2문장" } },
        required: ["emdCode", "summary"],
      },
    },
  },
  required: ["district", "dongs"],
};

const SUMMARY_SYSTEM = `너는 서울 자치구 보육 담당 공무원에게 시민 앱 'AI 상담' 이용 동향을 요약해 주는 분석가다.
입력은 최근 30일 익명 집계(행정동별 상담 수·주제·시간대·결과 없음 수)와, 대화 수집에 동의한 일부 부모의 질문(개인정보 가림 처리됨)이다.
- 숫자는 입력에 있는 값만 쓴다. 추측·일반론·정책 제안을 덧붙이지 않는다.
- 어느 동·시간대·대상에서 어떤 주제의 문의가 많은지, 시설을 못 찾은(결과 없음) 문의가 어디서 많은지를 짚는다.
- 특정 개인을 알아볼 수 있는 표현(가림 처리된 [이름] 등 포함)은 쓰지 않는다.
- 한국어, 공문서처럼 간결하게.`;

export async function buildAgentSummaries(now = new Date(), opts: { useLlm?: boolean } = {}) {
  const since = new Date(now.getTime() - PERIOD_DAYS * 86_400_000);
  const rows = await store().list<InsightDoc>(INSIGHTS, [["createdAt", ">=", since]]);
  const bySgg = new Map<string, InsightDoc[]>();
  for (const r of rows) bySgg.set(r.sigunguCode, [...(bySgg.get(r.sigunguCode) ?? []), r]);

  const written: string[] = [];
  for (const [sgg, list] of bySgg) {
    const byDong: Record<string, DongStat> = {};
    const total: DongStat = { count: 0, noResult: 0, topics: {}, bySlot: {}, byTarget: {} };
    for (const r of list) {
      const ds = (byDong[r.emdCode] ??= { count: 0, noResult: 0, topics: {}, bySlot: {}, byTarget: {} });
      for (const s of [ds, total]) {
        s.count++;
        if (r.outcome?.noResult) s.noResult++;
        for (const t of r.topics ?? []) bump(s.topics, t);
        for (const sl of r.timeSlots ?? []) bump(s.bySlot, sl);
        if (r.target) bump(s.byTarget, r.target);
      }
    }

    let summary: { district: string; dongs: { emdCode: string; summary: string }[] } | null = null;
    if (opts.useLlm !== false && list.length >= SUMMARY_MIN) {
      const logs = await store().list<{ question: string; emdCode: string; createdAt: unknown }>(LOGS, [["sigunguCode", "==", sgg]]);
      const recentQuestions = logs
        .filter((l) => millis(l.createdAt) >= since.getTime())
        .slice(0, 40)
        .map((l) => ({ emdCode: l.emdCode, question: l.question.slice(0, 200) }));
      try {
        const res = await generate()({
          model: GEMINI_MODEL(),
          contents: [{ role: "user", parts: [{ text: JSON.stringify({ sigunguCode: sgg, periodDays: PERIOD_DAYS, total, byDong, recentQuestions, topicLabels: TOPICS }) }] }],
          config: { systemInstruction: SUMMARY_SYSTEM, responseMimeType: "application/json", responseJsonSchema: SUMMARY_SCHEMA, maxOutputTokens: 4096 },
        });
        summary = JSON.parse(res.text ?? "null");
      } catch (e) {
        console.error("agent summary failed", sgg, e);
      }
    }

    // 표본이 적은 동의 요약문은 싣지 않는다 (숫자만)
    const dongSummaries = Object.fromEntries(
      (summary?.dongs ?? []).filter((x) => (byDong[x.emdCode]?.count ?? 0) >= SUMMARY_MIN).map((x) => [x.emdCode, x.summary]),
    );
    await store().set(SUMMARIES, sgg, {
      sigunguCode: sgg,
      periodDays: PERIOD_DAYS,
      generatedAt: now,
      total,
      byDong,
      summary: summary?.district ?? null,
      dongSummaries,
      summaryMin: SUMMARY_MIN,
      model: summary ? GEMINI_MODEL() : null,
      topicLabels: TOPICS,
    });
    written.push(sgg);
  }
  return written;
}
