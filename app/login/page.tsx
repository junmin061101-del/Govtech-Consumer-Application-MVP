"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import Link from "next/link";
import { useState } from "react";
import { auth, useEmulators } from "@/lib/firebase";
import { api, chip, input, primaryBtn, secondaryBtn } from "@/lib/ui";

// 개발용 로그인은 에뮬레이터에서만 보이고, 서버도 에뮬레이터에서만 받아 준다
const DEV = useEmulators;
const MIN_PASSWORD = 8;

/** Firebase Auth 오류 코드 → 안내 문구 */
function authMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호가 맞지 않아요";
    case "auth/email-already-in-use":
      return "이미 가입한 이메일이에요. 로그인해 주세요";
    case "auth/invalid-email":
      return "이메일 주소를 확인해 주세요";
    case "auth/weak-password":
      return `비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요`;
    case "auth/too-many-requests":
      return "시도가 너무 많았어요. 잠시 후 다시 시도해 주세요";
    case "auth/network-request-failed":
      return "네트워크 연결을 확인해 주세요";
    default:
      return "잠시 후 다시 시도해 주세요";
  }
}

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 로그인되면 이동은 AuthProvider 의 가입 가드가 맡는다 (가입 전이면 /signup)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (mode === "signup" && password.length < MIN_PASSWORD) return setMsg(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요`);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
        // 이메일 확인은 권장 사항이다 (가입을 막지 않는다)
        await sendEmailVerification(cred.user).catch(() => {});
      }
    } catch (err) {
      setMsg(authMessage(err));
      setBusy(false);
    }
  };

  const reset = async () => {
    setMsg(null);
    if (!email.trim()) return setMsg("비밀번호를 재설정할 이메일을 먼저 적어 주세요");
    try {
      await sendPasswordResetEmail(auth(), email.trim());
      setMsg("비밀번호 재설정 메일을 보냈어요 (가입한 이메일인 경우)");
    } catch (err) {
      setMsg(authMessage(err));
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-stone-50 p-6 text-stone-900">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">CareOS 돌봄지도</h1>
          <p className="text-sm text-stone-600">
            우리 아이 나이와 필요한 시간에 실제로 갈 수 있는 돌봄 시설을 찾고, 자리가 나면 알려 드려요.
          </p>
        </div>

        <div className="flex justify-center gap-2">
          <button className={chip(mode === "signin")} onClick={() => setMode("signin")}>
            로그인
          </button>
          <button className={chip(mode === "signup")} onClick={() => setMode("signup")}>
            처음이에요 (회원가입)
          </button>
        </div>

        <form className="space-y-2" onSubmit={submit}>
          <input
            type="email"
            autoComplete="email"
            required
            className={input}
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            className={input}
            placeholder={mode === "signin" ? "비밀번호" : `비밀번호 (${MIN_PASSWORD}자 이상)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {msg && (
            <p className="text-xs text-stone-700" role="status">
              {msg}
            </p>
          )}
          <button className={primaryBtn} disabled={busy}>
            {mode === "signin" ? "로그인" : "이메일로 가입하기"}
          </button>
        </form>
        {mode === "signin" && (
          <button className="block w-full text-center text-xs text-stone-500 underline" onClick={reset}>
            비밀번호를 잊었어요
          </button>
        )}

        <p className="text-center text-xs leading-relaxed text-stone-500">
          CareOS 는 만 14세 이상 보호자를 위한 서비스예요. 가입하면{" "}
          <Link href="/terms" className="underline">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline">
            개인정보 처리방침
          </Link>
          을 확인하고 동의하는 단계로 이어져요.
        </p>

        {DEV && <DevLogin />}
      </div>
    </main>
  );
}

function DevLogin() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const devLogin = async () => {
    try {
      const r = await api<{ token: string }>("/api/auth/dev", { method: "POST", json: { name } });
      await signInWithCustomToken(auth(), r.token);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3">
      <p className="text-xs font-semibold text-stone-600">개발용 로그인 (에뮬레이터 전용)</p>
      <div className="flex gap-2">
        <input className={input} placeholder="아이디 (예: parent1, admin)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={`${secondaryBtn} shrink-0`} onClick={devLogin} disabled={!name}>
          로그인
        </button>
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}
