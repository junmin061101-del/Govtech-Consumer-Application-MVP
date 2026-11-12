"use client";

// AI 가 쓴 어린이집 메일 초안을 부모가 고치고, 직접 '보내기'를 눌러야 보낸다.
// [아이 이름] 같은 빈칸은 여기서만 채운다 (AI 에게는 보내지 않는다). 받는 주소는 이 기기에 시설별로 기억한다.
import { useState } from "react";
import { gmailClientId, mailtoUrl, sendWithGmail } from "@/lib/gmail";
import { api } from "@/lib/ui";

const BLANK = /\[(아이 이름|보호자 이름|연락처|반 이름)\]/g;
const toKey = (facility: string) => `careos:mail-to:${facility}`;

function loadTo(facility: string) {
  try {
    return localStorage.getItem(toKey(facility)) ?? "";
  } catch {
    return "";
  }
}

export default function EmailCompose({ facility, subject: s0, body: b0 }: { facility: string; subject: string; body: string }) {
  const [to, setTo] = useState(() => (typeof window === "undefined" ? "" : loadTo(facility)));
  const [subject, setSubject] = useState(s0);
  const [body, setBody] = useState(b0);
  const [mode, setMode] = useState<"pick" | "naver" | "confirm-gmail">("pick");
  const [naverId, setNaverId] = useState("");
  const [appPw, setAppPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const blanks = [...new Set([...(subject + body).matchAll(BLANK)].map((m) => m[0]))];
  const toOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to.trim());
  const ready = toOk && blanks.length === 0 && subject.trim() && body.trim();
  const mail = { to: to.trim(), subject, body };
  const remember = () => {
    try {
      localStorage.setItem(toKey(facility), to.trim());
    } catch {
      /* 기억 못 해도 괜찮다 */
    }
  };

  const run = async (f: () => Promise<void>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
      remember();
      setMsg({ ok: true, text: done });
      setMode("pick");
      setAppPw("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-600";
  const btn = "flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40";

  if (msg?.ok) {
    return <p className="max-w-[92%] rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">✓ {msg.text}</p>;
  }

  return (
    <div className="max-w-[92%] space-y-2 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm">
      <p className="text-xs font-semibold text-stone-700">✉️ {facility} 에 보낼 메일 (초안)</p>
      <label className="block text-[11px] text-stone-500">
        받는 사람 (어린이집 이메일)
        <input className={input} type="email" inputMode="email" placeholder="예: daycare@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="block text-[11px] text-stone-500">
        제목
        <input className={input} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block text-[11px] text-stone-500">
        본문
        <textarea className={`${input} h-40 resize-y leading-relaxed`} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      </label>
      {blanks.length > 0 && <p className="text-[11px] text-amber-700">빈칸을 채워 주세요: {blanks.join(", ")} (이 내용은 AI 에게 보내지 않아요)</p>}
      {!toOk && to && <p className="text-[11px] text-amber-700">이메일 주소를 확인해 주세요.</p>}

      {mode === "pick" && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-stone-500">보낼 방법을 고르면, 한 번 더 확인한 뒤 보내요.</p>
          <div className="flex gap-1.5">
            <button disabled={!ready || busy || !gmailClientId()} onClick={() => setMode("confirm-gmail")} className={`${btn} border-stone-300 text-stone-700`} title={!gmailClientId() ? "Gmail 연결 준비 중" : undefined}>
              Gmail
            </button>
            <button disabled={!ready || busy} onClick={() => setMode("naver")} className={`${btn} border-[#03c75a] text-[#03a94e]`}>
              네이버 메일
            </button>
            <a
              href={ready ? mailtoUrl(mail) : undefined}
              aria-disabled={!ready}
              onClick={() => ready && remember()}
              className={`${btn} border-stone-300 text-center text-stone-700 ${ready ? "" : "pointer-events-none opacity-40"}`}
            >
              메일 앱
            </a>
          </div>
        </div>
      )}

      {mode === "confirm-gmail" && (
        <div className="space-y-1.5 rounded-xl bg-stone-50 p-2.5 text-xs">
          <p className="font-semibold text-stone-800">Gmail 로 {mail.to} 에게 보낼까요?</p>
          <p className="text-[11px] text-stone-500">Google 로그인 창에서 &lsquo;메일 보내기&rsquo; 권한만 허용해요. 받은편지함은 읽지 않고, 권한은 보낸 뒤 바로 해제해요.</p>
          <div className="flex gap-1.5">
            <button onClick={() => setMode("pick")} className={`${btn} border-stone-300 text-stone-600`}>
              취소
            </button>
            <button disabled={busy} onClick={() => run(() => sendWithGmail(mail), `Gmail 로 ${mail.to} 에 보냈어요.`)} className={`${btn} border-emerald-600 bg-emerald-600 text-white`}>
              {busy ? "보내는 중…" : "보내기"}
            </button>
          </div>
        </div>
      )}

      {mode === "naver" && (
        <form
          className="space-y-1.5 rounded-xl bg-stone-50 p-2.5 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => api("/api/mail/naver", { method: "POST", json: { naverId, appPassword: appPw, ...mail } }).then(() => undefined),
              `네이버 메일로 ${mail.to} 에 보냈어요.`,
            );
          }}
        >
          <p className="font-semibold text-stone-800">네이버 메일로 {mail.to} 에게 보낼까요?</p>
          <input className={input} placeholder="네이버 아이디" autoComplete="username" value={naverId} onChange={(e) => setNaverId(e.target.value)} />
          <input
            className={input}
            type="password"
            placeholder="네이버 애플리케이션 비밀번호"
            autoComplete="current-password"
            value={appPw}
            onChange={(e) => setAppPw(e.target.value)}
          />
          <p className="text-[11px] leading-snug text-stone-500">
            네이버 메일 환경설정에서 &lsquo;POP3/SMTP 사용&rsquo;을 켜고, 네이버 내정보 &gt; 보안 설정 &gt; 2단계 인증 &gt; 애플리케이션
            비밀번호를 만들어 넣어 주세요. 이 비밀번호는 이번 한 번 보내는 데만 쓰고 저장하지 않아요.
          </p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setMode("pick")} className={`${btn} border-stone-300 text-stone-600`}>
              취소
            </button>
            <button disabled={busy || !naverId || !appPw} className={`${btn} border-[#03c75a] bg-[#03c75a] text-white`}>
              {busy ? "보내는 중…" : "보내기"}
            </button>
          </div>
        </form>
      )}
      {msg && !msg.ok && <p className="text-[11px] text-red-600">{msg.text}</p>}
    </div>
  );
}
