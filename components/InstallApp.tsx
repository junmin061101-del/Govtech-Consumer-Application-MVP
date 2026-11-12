"use client";

// 홈 화면에 설치 (PWA). 안드로이드 Chrome·데스크톱 Chrome/Edge 는 설치 창을 띄우고, 아이폰은 Safari 공유 메뉴 안내를 보여 준다.
// 설치하면 앱처럼 열리고, 아이콘을 길게 누르면 'AI 상담' 바로가기가 나온다 (app/manifest.ts).
import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function InstallApp() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="text-sm text-stone-600">홈 화면에 설치되어 있어요. 아이콘을 길게 누르면 AI 상담으로 바로 갈 수 있어요.</p>;

  return (
    <div className="space-y-2 text-sm text-stone-700">
      <p>홈 화면에 CareOS 아이콘을 두면 앱처럼 바로 열려요. 아이콘을 길게 누르면 &lsquo;AI 상담&rsquo;으로 바로 갈 수 있어요.</p>
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
          }}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white"
        >
          홈 화면에 추가
        </button>
      ) : ios ? (
        <p className="rounded-lg bg-stone-100 p-2.5 text-xs">Safari 아래쪽 공유 버튼(□↑) → &lsquo;홈 화면에 추가&rsquo;를 눌러 주세요.</p>
      ) : (
        <p className="rounded-lg bg-stone-100 p-2.5 text-xs">브라우저 메뉴(⋮)에서 &lsquo;앱 설치&rsquo; 또는 &lsquo;홈 화면에 추가&rsquo;를 눌러 주세요.</p>
      )}
      <p className="text-xs text-stone-500">
        컴퓨터(Chrome·Edge)에서는 💬 버튼 → &lsquo;작게 띄우기&rsquo;로, 다른 사이트(아이사랑 등)를 보면서도 AI 상담 창을 항상 위에 띄워 둘 수 있어요.{" "}
        <a href="/extension" className="text-emerald-700 underline">
          PC 신청 도우미(확장 프로그램)
        </a>
        를 설치하면 아이사랑 화면을 바로 보내고, 다음 버튼을 화면에 표시해 줘요.
      </p>
    </div>
  );
}
