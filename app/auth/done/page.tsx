"use client";

import { signInWithCustomToken } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

// 카카오 로그인 후 서버가 보낸 Firebase 토큰(URL fragment)으로 로그인을 마무리한다.
export default function AuthDone() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const err = params.get("error");
    // 주소창에 토큰이 남지 않게 바로 지운다
    history.replaceState(null, "", window.location.pathname);

    if (err || !token) {
      setError(err ?? "로그인 정보를 받지 못했어요");
      return;
    }
    signInWithCustomToken(auth(), token)
      .then(() => window.location.replace("/"))
      .catch(() => setError("로그인을 완료하지 못했어요. 다시 시도해 주세요"));
  }, []);

  return (
    <main className="grid h-dvh place-items-center bg-stone-50 p-6 text-center text-sm text-stone-700">
      {error ? (
        <div className="space-y-3">
          <p className="font-semibold text-stone-900">로그인하지 못했어요</p>
          <p>{error}</p>
          <a href="/" className="inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">
            지도로 돌아가기
          </a>
        </div>
      ) : (
        <p>로그인 중이에요…</p>
      )}
    </main>
  );
}
