"use client";

import { useState } from "react";
import { api, input, secondaryBtn } from "@/lib/ui";

/** 휴대폰 번호 인증. 인증되면 onVerified 를 부르고, 번호는 서버 인증 기록에만 남는다. */
export default function PhoneVerify({ onVerified }: { onVerified: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ devCode?: string }>("/api/phone/send", { method: "POST", json: { phone } });
      setSent(true);
      setMsg(r.devCode ? `개발 환경 인증번호: ${r.devCode}` : "인증번호를 보냈어요");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/phone/verify", { method: "POST", json: { code } });
      setDone(true);
      setMsg("인증됐어요");
      onVerified();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <p className="text-sm font-medium text-emerald-700">✓ 휴대폰 인증 완료</p>;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-0000-0000"
          className={input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="button" className={`${secondaryBtn} shrink-0`} disabled={busy || phone.length < 10} onClick={send}>
          {sent ? "다시 받기" : "인증번호 받기"}
        </button>
      </div>
      {sent && (
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="인증번호 6자리"
            className={input}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button type="button" className={`${secondaryBtn} shrink-0`} disabled={busy || code.length !== 6} onClick={verify}>
            확인
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-stone-600" role="status">{msg}</p>}
    </div>
  );
}
