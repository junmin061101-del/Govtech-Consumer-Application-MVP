"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCurrentLocation, type Here } from "@/components/useCurrentLocation";
import { api } from "@/lib/ui";
import { reviewLinks } from "@/lib/reviewLinks";
import BlogPosts from "@/components/BlogPosts";
import EmailCompose from "@/components/EmailCompose";
import IsarangGuideCard from "@/components/IsarangGuideCard";
import { canCaptureScreen, shotFromDataUrl, shotFromFile, shotFromScreen, type Shot } from "@/lib/capture";
import { useSpeechInput } from "@/components/useSpeechInput";
import type { ReactNode } from "react";

// 대화 기록은 이 탭(sessionStorage)에만 둔다. 서버는 저장하지 않고, 매 요청에 기록 전체를 그대로 다시 보낸다.
// 기록은 덧붙이기만 한다 (Gemini 응답의 thoughtSignature 가 앞선 대화와 이어져 있어 중간을 고치면 안 된다).
const STORE_KEY = "careos:agent:v2";
const MAX_STEPS = 8;
/** 서버(lib/server/agent.ts MAX_IMAGES)와 같은 값 */
const MAX_SHOTS = 3;

// Gemini 대화 형식 (role: user | model, parts)
type Part = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: unknown;
  inlineData?: { mimeType: string; data: string };
  [k: string]: unknown;
};
type Msg = { role: "user" | "model"; parts: Part[] };

const SUGGESTIONS = [
  "내 주변에서 평일 저녁 8시까지 맡길 수 있는 곳 찾아줘",
  "지금 자리 있는 어린이집 알려줘",
  "어린이집 입소 신청 방법이랑 필요한 서류 알려줘",
  "토요일에 아이 맡길 곳이 있을까?",
  "아이사랑 등록대기 신청 같이 해줘",
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
  get_review_links: "후기 링크 찾기",
  draft_email: "메일 초안 쓰기",
  isarang_guide: "아이사랑 안내 준비",
  create_vacancy_alert: "빈자리 알림 등록",
};

type ReviewLinkView = { label: string; url: string };

/** get_review_links 도구 결과(시설 이름·주소) → 버튼용 링크. 링크는 지도 화면과 같은 규칙으로 앱이 만든다 */
function reviewLinksOf(p: Part): { facility: string; address: string; links: ReviewLinkView[] } | null {
  const fr = p.functionResponse as { name?: string; response?: { facility?: unknown; address?: unknown } } | undefined;
  if (fr?.name !== "get_review_links" || typeof fr.response?.facility !== "string" || !fr.response.facility) return null;
  const name = fr.response.facility;
  const address = typeof fr.response.address === "string" ? fr.response.address : "";
  return { facility: name, address, links: reviewLinks({ name, address }) };
}

function load(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
/** 확장 프로그램이 보낸 아이사랑 화면은 열려 있는 상담 화면 중 하나만 받는다 (작은 창 > 시트 > 탭) */
const PRIORITY: Record<string, number> = { pip: 3, sheet: 2, page: 1 };
const mounted = new Map<string, number>();
const isTop = (id: string) => [...mounted.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] === id;
export const PAGE_INFO_RE = /^\[아이사랑 화면 정보\]/;

/** 같은 대화를 쓰는 다른 화면(AI 상담 탭·떠 있는 창·작은 창)에 바뀐 것을 알린다 */
const SYNC_EVENT = "careos-agent-sync";

function save(m: Msg[], from: string) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(m));
  } catch {
    /* 저장 못 해도 대화는 계속된다 */
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: from }));
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

export type AgentVariant = "page" | "sheet" | "pip";

/**
 * AI 상담 대화 화면. AI 상담 탭(page), 어느 화면에서나 띄우는 시트(sheet), 다른 사이트를 보면서 쓰는 작은 창(pip)이
 * 같은 대화(sessionStorage)를 함께 쓴다.
 */
export default function AgentChat({ variant = "page", actions }: { variant?: AgentVariant; actions?: ReactNode }) {
  const compact = variant !== "page";
  const id = useRef(Math.random().toString(36).slice(2)).current;
  const { flags, loading, profile } = useAuth();
  const aiLog = Boolean(profile?.consents.aiLog?.agreed);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [pageInfo, setPageInfo] = useState<string | null>(null);
  const [camMenu, setCamMenu] = useState(false);
  const [extInstalled, setExtInstalled] = useState(false);
  useEffect(() => setExtInstalled(Boolean(document.documentElement.dataset.careosExt)), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // 현재 위치 (지도 화면과 같은 설정을 쓴다)
  const { here, busy: locBusy, error: locError, enable, disable } = useCurrentLocation();
  const toggleLocation = async () => {
    setError(null);
    if (here) disable();
    else await enable();
  };

  // 'CareOS 신청 도우미' 확장 프로그램이 보낸 아이사랑 화면(요약 + 캡처)을 첨부한다. 보내기는 부모가 누른다
  useEffect(() => {
    mounted.set(id, PRIORITY[variant] ?? 0);
    const onMsg = async (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || e.origin !== window.location.origin || d?.source !== "careos-ext" || d.type !== "isarang-screen") return;
      if (!isTop(id)) return;
      setPageInfo(String(d.summary ?? "").slice(0, 4000) || null);
      if (typeof d.image === "string") setShot(await shotFromDataUrl(d.image).catch(() => null));
    };
    window.addEventListener("message", onMsg);
    return () => {
      mounted.delete(id);
      window.removeEventListener("message", onMsg);
    };
  }, [id, variant]);

  useEffect(() => {
    setMessages(load());
    const onSync = (e: Event) => {
      if ((e as CustomEvent).detail !== id) {
        setMessages(load());
        // 다른 화면에서 보냈으면 이 화면의 첨부는 비운다
        setShot(null);
        setPageInfo(null);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [id]);

  // 음성 입력: 말하는 동안 입력칸에 글자가 차고, 말을 마치면 바로 보낸다
  const sendRef = useRef<(t: string) => void>(() => {});
  const speech = useSpeechInput((text, final) => {
    setInput(text);
    if (final) sendRef.current(text);
  });
  // 중괄호 필수: 최신 브라우저의 scrollIntoView 는 Promise 를 돌려줘서, 그대로 반환하면 React 가 정리 함수로 부르다 터진다
  useEffect(() => {
    void bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  if (loading) return null;
  if (!flags.agent) return <p className="p-6 text-center text-sm text-stone-500">아직 열리지 않은 기능이에요.</p>;

  const shotsUsed = messages.reduce((n, m) => n + m.parts.filter((p) => p.inlineData).length, 0);
  const capture = async (from: "screen" | "file", file?: File) => {
    setError(null);
    if (shotsUsed >= MAX_SHOTS) {
      setError(`화면 캡처는 대화당 ${MAX_SHOTS}장까지예요. '새 대화'로 이어서 물어봐 주세요.`);
      return;
    }
    try {
      setShot(from === "screen" ? await shotFromScreen() : await shotFromFile(file!));
    } catch (e) {
      const name = (e as Error)?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") setError((e as Error).message || "캡처하지 못했어요");
    }
  };
  // 카드의 '막히면 화면 보내기': 컴퓨터는 화면 공유로 바로 찍고, 휴대폰은 사진(캡처) 고르기
  const startCapture = () => (canCaptureScreen() ? void capture("screen") : fileRef.current?.click());

  const send = async (text: string) => {
    const q = text.trim() || (shot || pageInfo ? "이 화면에서 다음에 뭘 하면 돼?" : "");
    if (!q || busy) return;
    setError(null);
    setInput("");
    const parts: Part[] = [{ text: `${contextLine(here)}\n${q}` }];
    if (pageInfo) parts.push({ text: pageInfo });
    if (shot) parts.push({ inlineData: { mimeType: shot.mimeType, data: shot.data } });
    setShot(null);
    setPageInfo(null);
    let history: Msg[] = [...messages, { role: "user", parts }];
    setMessages(history);
    save(history, id);
    setBusy("생각하는 중…");
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await api<{ append: Msg[]; done: boolean; toolLabels: string[] }>("/api/agent", {
          method: "POST",
          json: { contents: history },
        });
        history = [...history, ...r.append];
        setMessages(history);
        save(history, id);
        // AI 가 아이사랑 버튼 표시를 요청하면 확장 프로그램에 전한다 (표시만, 누르지 않음)
        for (const m of r.append) {
          for (const p of m.parts) {
            if (p.functionCall?.name === "point_on_isarang") {
              window.postMessage({ source: "careos-app", type: "highlight", text: p.functionCall.args?.text, note: p.functionCall.args?.note }, window.location.origin);
            }
          }
        }
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

  sendRef.current = (t: string) => void send(t);

  const reset = () => {
    setMessages([]);
    save([], id);
    setError(null);
  };

  // 화면에 보이는 것: 사용자 질문, AI 의 글, 도구 사용 표시. 도구 결과·사고 내용은 숨긴다
  type View = {
    key: string;
    kind: "user" | "assistant" | "tool" | "links" | "email" | "isarang" | "point";
    pageInfo?: boolean;
    text: string;
    image?: string;
    task?: string;
    links?: ReviewLinkView[];
    address?: string;
    email?: { subject: string; body: string };
  };
  const view = messages.flatMap((m, i): View[] => {
    if (m.role === "user") {
      // 후기 링크 도구의 결과는 버튼으로 바로 보여 준다 (AI 가 주소를 다시 쓰지 않게)
      const linkViews = m.parts.flatMap((p, j): View[] => {
        const links = reviewLinksOf(p);
        return links ? [{ key: `l${i}-${j}`, kind: "links", text: links.facility, links: links.links, address: links.address }] : [];
      });
      if (linkViews.length) return linkViews;
      const info = m.parts.some((p) => p.text && PAGE_INFO_RE.test(p.text));
      const text = m.parts
        .filter((p) => !(p.text && PAGE_INFO_RE.test(p.text)))
        .map((p) => p.text ?? "")
        .join("")
        .replace(CONTEXT_RE, "")
        .trim();
      const img = m.parts.find((p) => p.inlineData)?.inlineData;
      return text || img || info
        ? [{ key: `u${i}`, kind: "user", text, image: img ? `data:${img.mimeType};base64,${img.data}` : undefined, pageInfo: info }]
        : [];
    }
    return m.parts.flatMap((p, j): View[] =>
      p.thought
        ? []
        : p.text?.trim()
          ? [{ key: `a${i}-${j}`, kind: "assistant", text: p.text }]
          : p.functionCall?.name === "point_on_isarang"
            ? [{ key: `p${i}-${j}`, kind: "point", text: String(p.functionCall.args?.text ?? "").slice(0, 60) }]
            : p.functionCall?.name === "isarang_guide"
            ? [
                {
                  key: `g${i}-${j}`,
                  kind: "isarang",
                  text: String(p.functionCall.args?.facility_name ?? "").slice(0, 60),
                  task: String(p.functionCall.args?.task ?? ""),
                },
              ]
            : p.functionCall?.name === "draft_email"
            ? [
                {
                  key: `e${i}-${j}`,
                  kind: "email",
                  text: String(p.functionCall.args?.facility_name ?? "").slice(0, 60),
                  email: { subject: String(p.functionCall.args?.subject ?? "").slice(0, 200), body: String(p.functionCall.args?.body ?? "").slice(0, 5000) },
                },
              ]
            : p.functionCall?.name
              ? [{ key: `t${i}-${j}`, kind: "tool", text: TOOL_LABELS[p.functionCall.name] ?? p.functionCall.name }]
              : [],
    );
  });

  return (
    <main className={`${compact ? "h-full" : "h-app"} flex flex-col bg-stone-50 text-stone-900`}>
      <header className="border-b border-stone-200 bg-white">
        <div className={`mx-auto flex max-w-2xl items-center gap-2 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
          <h1 className={`flex-1 font-bold tracking-tight ${compact ? "text-sm" : "text-base"}`}>AI 상담</h1>
          <button
            onClick={toggleLocation}
            disabled={locBusy}
            aria-pressed={Boolean(here)}
            className={`max-w-[55%] truncate rounded-full border px-3 py-1 text-xs ${
              here ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-300 text-stone-600"
            }`}
          >
            {locBusy ? "위치 확인 중…" : here ? `📍 ${here.label}` : compact ? "📍 위치" : "📍 현재 위치 사용"}
          </button>
          {messages.length > 0 && (
            <button onClick={reset} disabled={Boolean(busy)} className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600">
              새 대화
            </button>
          )}
          {actions}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
          {view.length === 0 && (
            <div className={`space-y-4 text-center ${compact ? "pt-2" : "pt-6"}`}>
              <p className={`font-bold ${compact ? "text-base" : "text-lg"}`}>무엇을 도와드릴까요?</p>
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
            v.kind === "point" ? (
              <p key={v.key} className="text-xs text-emerald-700">
                👉 아이사랑 화면에 &lsquo;{v.text}&rsquo; 표시
                {!extInstalled && <span className="text-stone-400"> (PC 확장 프로그램을 설치하면 화면에 테두리로 보여요)</span>}
              </p>
            ) : v.kind === "isarang" ? (
              <IsarangGuideCard key={v.key} task={v.task!} facility={v.text || null} onCapture={startCapture} />
            ) : v.kind === "email" ? (
              <EmailCompose key={v.key} facility={v.text} subject={v.email!.subject} body={v.email!.body} />
            ) : v.kind === "links" ? (
              <div key={v.key} className="max-w-[92%] space-y-1.5 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5">
                <p className="text-xs font-semibold text-stone-700">{v.text} 후기·평판</p>
                <div className="flex flex-wrap gap-1.5">
                  {v.links!.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-emerald-600 px-3 py-1 text-xs font-medium text-emerald-700"
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
                {/* 블로그 글은 누를 때 화면에만 불러온다 (AI 대화 기록에 넣지 않는다) */}
                <BlogPosts name={v.text} address={v.address} />
              </div>
            ) : v.kind === "user" ? (
              <div key={v.key} className="flex flex-col items-end gap-1">
                {v.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.image} alt="보낸 화면 캡처" className="max-h-48 max-w-[70%] rounded-xl border border-stone-200 object-contain" />
                )}
                {v.pageInfo && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">📄 아이사랑 화면 정보 첨부</span>}
                {v.text && (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white">{v.text}</p>
                )}
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
          {(error || locError || speech.error) && <p className="text-sm text-red-600">{error ?? locError ?? speech.error}</p>}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-stone-200 bg-white">
        {pageInfo && !shot && (
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 pt-3 text-[11px] text-emerald-800">
            📄 아이사랑 화면 정보가 첨부됐어요. 궁금한 걸 적거나 그대로 &lsquo;보내기&rsquo;를 눌러 주세요.
            <button type="button" onClick={() => setPageInfo(null)} className="text-stone-500 underline">
              빼기
            </button>
          </div>
        )}
        {shot && (
          <div className="mx-auto flex max-w-2xl items-start gap-2 px-4 pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.preview} alt="보낼 화면 캡처" className="h-20 w-auto rounded-lg border border-stone-200" />
            <p className="flex-1 text-[11px] leading-snug text-amber-800">
              주민등록번호·아이 이름 같은 개인정보가 보이면 &lsquo;빼기&rsquo; 후 그 부분을 가려서 다시 찍어 주세요. 이 이미지는 답을 만들 때
              Google Gemini 로 보내고 서버에 저장하지 않아요.
            </p>
            <button
              type="button"
              onClick={() => {
                setShot(null);
                setPageInfo(null);
              }}
              className="shrink-0 text-xs text-stone-500 underline"
            >
              빼기
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void capture("file", f);
          }}
        />
        <form
          className="mx-auto flex max-w-2xl gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          {speech.supported && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              disabled={Boolean(busy)}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? "음성 입력 멈추기" : "음성으로 묻기"}
              className={`shrink-0 rounded-full border px-3 text-base disabled:opacity-50 ${
                speech.listening ? "animate-pulse border-red-500 bg-red-50 text-red-600" : "border-stone-300 text-stone-600"
              }`}
            >
              🎤
            </button>
          )}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => (canCaptureScreen() ? setCamMenu((v) => !v) : fileRef.current?.click())}
              disabled={Boolean(busy)}
              aria-label="화면 캡처·사진 보내기"
              aria-expanded={camMenu}
              className="h-full rounded-full border border-stone-300 px-3 text-base text-stone-600 disabled:opacity-50"
            >
              📷
            </button>
            {camMenu && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white text-xs shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left hover:bg-stone-50"
                  onClick={() => {
                    setCamMenu(false);
                    void capture("screen");
                  }}
                >
                  🖥️ 다른 탭 화면 캡처
                  <span className="block text-[10px] text-stone-400">공유 창에서 아이사랑 탭을 고르면 한 장만 찍어요</span>
                </button>
                <button
                  type="button"
                  className="block w-full border-t border-stone-100 px-3 py-2.5 text-left hover:bg-stone-50"
                  onClick={() => {
                    setCamMenu(false);
                    fileRef.current?.click();
                  }}
                >
                  🖼️ 사진·캡처 파일 고르기
                </button>
              </div>
            )}
          </div>
          <input
            className="w-full rounded-full border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-600"
            placeholder={speech.listening ? "듣고 있어요… 말을 마치면 바로 보내요" : "예: 상도동에서 평일 7시~21시 만 3세"}
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            disabled={Boolean(busy)}
          />
          <button className="shrink-0 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(busy) || (!input.trim() && !shot && !pageInfo)}>
            보내기
          </button>
        </form>
        <p className={`mx-auto max-w-2xl px-4 pb-3 text-[11px] leading-snug text-stone-400 ${compact ? "line-clamp-2" : ""}`}>
          AI 답변은 틀릴 수 있어요. 빈자리는 공개자료 기준 추정이니 시설에 꼭 확인하고, 자격·입소 여부는 공식 창구에서 확인해 주세요.
          아이 이름·연락처 같은 개인정보는 적지 마세요. 입력한 문장은 답변을 만들 때 Google Gemini(Vertex AI)로 보내요.{" "}
          {speech.supported && "음성 입력은 브라우저(Google·Apple 등)의 음성 인식으로 글자로 바뀌어요. "}
          {aiLog
            ? "대화 내용 수집에 동의해서 개인정보를 가린 대화가 90일 보관돼요 (내 정보에서 끌 수 있어요)."
            : "대화 내용은 저장하지 않고, 누구인지 알 수 없는 통계만 남아요."}
        </p>
      </div>
    </main>
  );
}
