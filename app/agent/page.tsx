"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCurrentLocation, type Here } from "@/components/useCurrentLocation";
import { api } from "@/lib/ui";

// 대화 기록은 이 탭(sessionStorage)에만 둔다. 서버는 저장하지 않고, 매 요청에 기록 전체를 그대로 다시 보낸다.
// 기록은 덧붙이기만 한다 (Gemini 응답의 thoughtSignature 가 앞선 대화와 이어져 있어 중간을 고치면 안 된다).
const STORE_KEY = "careos:agent:v2";
const MAX_STEPS = 8;

// Gemini 대화 형식 (role: user | model, parts)
type Part = { text?: string; functionCall?: { name?: string }; functionResponse?: unknown; [k: string]: unknown };
type Msg = { role: "user" | "model"; parts: Part[] };

const SUGGESTIONS = [
  "내 주변에서 평일 저녁 8시까지 맡길 수 있는 곳 찾아줘",
  "지금 자리 있는 어린이집 알려줘",
  "어린이집 입소 신청 방법이랑 필요한 서류 알려줘",
  "토요일에 아이 맡길 곳이 있을까?",
];

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 앱이 메시지 앞에 붙이는 정보 줄. AI 는 이 줄로 오늘 날짜·현재 위치를 안다 (화면에는 숨긴다) */
function contextLine(here: Here | null) {
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const loc = here
    ? `현재 위치: ${here.label} (행정동 ${here.emdCode}, 대략 좌표 ${here.lat.toFixed(3)},${here.lng.toFixed(3)})`
    : "현재 위치: 사용 안 함";
  return `[오늘 ${ymd}(${WEEK[now.getDay()]}) · ${loc}]`;
}
const CONTEXT_RE = /^\[오늘 [^\]]*\]\n?/;

const TOOL_LABELS: Record<string, string> = {
  get_my_profile: "프로필 확인",
  find_dong: "동네 찾기",
  search_facilities: "시설 검색",
  search_knowledge: "안내 문서 검색",
  list_my_alerts: "알림 확인",
  create_vacancy_alert: "빈자리 알림 등록",
};

function load(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function save(m: Msg[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(m));
  } catch {
    /* 저장 못 해도 대화는 계속된다 */
  }
}

/** 한 줄 안의 **굵게**, [링크](https://…). *기울임* 표시는 기호만 뺀다 */
function Inline({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return (
    <>
      {tokens.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link) {
          return (
            <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
              {link[1]}
            </a>
          );
        }
        return <span key={i}>{p.replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,)])/g, "$1$2")}</span>;
      })}
    </>
  );
}

/** AI 답변의 간단한 마크다운: 제목(#), 구분선(---), 목록(- , 1.), 굵게. 그 밖은 그대로 보여 준다 */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^-{3,}$/.test(t)) return <hr key={i} className="my-2 border-stone-200" />;
        const h = t.match(/^#{1,4}\s+(.*)$/);
        if (h) return <p key={i} className="pt-1 font-bold"><Inline text={h[1]} /></p>;
        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (bullet) return <p key={i} className={bullet[1] ? "pl-6" : "pl-3"}>· <Inline text={bullet[2]} /></p>;
        return <p key={i} className={/^\s+/.test(line) ? "pl-6" : ""}><Inline text={t} /></p>;
      })}
    </div>
  );
}

export default function Agent() {
  const { flags, loading, profile } = useAuth();
  const aiLog = Boolean(profile?.consents.aiLog?.agreed);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // 현재 위치 (지도 화면과 같은 설정을 쓴다)
  const { here, busy: locBusy, error: locError, enable, disable } = useCurrentLocation();
  const toggleLocation = async () => {
    setError(null);
    if (here) disable();
    else await enable();
  };

  useEffect(() => {
    setMessages(load());
  }, []);
  // 중괄호 필수: 최신 브라우저의 scrollIntoView 는 Promise 를 돌려줘서, 그대로 반환하면 React 가 정리 함수로 부르다 터진다
  useEffect(() => {
    void bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  if (loading) return null;
  if (!flags.agent) return <p className="p-6 text-center text-sm text-stone-500">아직 열리지 않은 기능이에요.</p>;

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    let history: Msg[] = [...messages, { role: "user", parts: [{ text: `${contextLine(here)}\n${q}` }] }];
    setMessages(history);
    save(history);
    setBusy("생각하는 중…");
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await api<{ append: Msg[]; done: boolean; toolLabels: string[] }>("/api/agent", {
          method: "POST",
          json: { contents: history },
        });
        history = [...history, ...r.append];
        setMessages(history);
        save(history);
        if (r.done) break;
        setBusy(`${r.toolLabels.join(", ")} 중…`);
      }
    } catch (e) {
      setError((e as Error).message);
      // 실패한 질문은 기록 끝에 남아 있으므로, 그대로 두면 다음 질문과 함께 다시 보내진다
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setMessages([]);
    save([]);
    setError(null);
  };

  // 화면에 보이는 것: 사용자 질문, AI 의 글, 도구 사용 표시. 도구 결과·사고 내용은 숨긴다
  type View = { key: string; kind: "user" | "assistant" | "tool"; text: string };
  const view = messages.flatMap((m, i): View[] => {
    if (m.role === "user") {
      const text = m.parts.map((p) => p.text ?? "").join("").replace(CONTEXT_RE, "").trim();
      return text ? [{ key: `u${i}`, kind: "user", text }] : [];
    }
    return m.parts.flatMap((p, j): View[] =>
      p.thought
        ? []
        : p.text?.trim()
          ? [{ key: `a${i}-${j}`, kind: "assistant", text: p.text }]
          : p.functionCall?.name
            ? [{ key: `t${i}-${j}`, kind: "tool", text: TOOL_LABELS[p.functionCall.name] ?? p.functionCall.name }]
            : [],
    );
  });

  return (
    <main className="h-app flex flex-col bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <h1 className="flex-1 text-base font-bold tracking-tight">AI 상담</h1>
          <button
            onClick={toggleLocation}
            disabled={locBusy}
            aria-pressed={Boolean(here)}
            className={`max-w-[55%] truncate rounded-full border px-3 py-1 text-xs ${
              here ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-300 text-stone-600"
            }`}
          >
            {locBusy ? "위치 확인 중…" : here ? `📍 ${here.label}` : "📍 현재 위치 사용"}
          </button>
          {messages.length > 0 && (
            <button onClick={reset} disabled={Boolean(busy)} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600">
              새 대화
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
          {view.length === 0 && (
            <div className="space-y-4 pt-6 text-center">
              <p className="text-lg font-bold">무엇을 도와드릴까요?</p>
              <p className="text-sm text-stone-600">
                필요한 요일·시간을 말하면 AI 가 현재 위치(또는 관심 지역)와 아이 연령을 반영해 시설을 찾고, 최신 안내 문서를 찾아
                신청 방법·서류·창구를 알려 드려요.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm hover:border-emerald-400">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view.map((v) =>
            v.kind === "user" ? (
              <div key={v.key} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white">{v.text}</p>
              </div>
            ) : v.kind === "tool" ? (
              <p key={v.key} className="text-xs text-stone-400">
                🔎 {v.text}
              </p>
            ) : (
              <div key={v.key} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
                <Rich text={v.text} />
              </div>
            ),
          )}

          {busy && <p className="animate-pulse text-xs text-emerald-700">{busy}</p>}
          {(error || locError) && <p className="text-sm text-red-600">{error ?? locError}</p>}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-stone-200 bg-white">
        <form
          className="mx-auto flex max-w-2xl gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            className="w-full rounded-full border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-600"
            placeholder="예: 상도동에서 평일 7시~21시 만 3세"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            disabled={Boolean(busy)}
          />
          <button className="shrink-0 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(busy) || !input.trim()}>
            보내기
          </button>
        </form>
        <p className="mx-auto max-w-2xl px-4 pb-3 text-[11px] leading-snug text-stone-400">
          AI 답변은 틀릴 수 있어요. 빈자리는 공개자료 기준 추정이니 시설에 꼭 확인하고, 자격·입소 여부는 공식 창구에서 확인해 주세요.
          아이 이름·연락처 같은 개인정보는 적지 마세요. 입력한 문장은 답변을 만들 때 Google Gemini(Vertex AI)로 보내요.{" "}
          {aiLog
            ? "대화 내용 수집에 동의해서 개인정보를 가린 대화가 90일 보관돼요 (내 정보에서 끌 수 있어요)."
            : "대화 내용은 저장하지 않고, 누구인지 알 수 없는 통계만 남아요."}
        </p>
      </div>
    </main>
  );
}
