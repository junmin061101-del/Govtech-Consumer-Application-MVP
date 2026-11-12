"use client";

// 어느 화면에서나 따라다니는 AI 상담 버튼.
//  - 누르면 아래에서 올라오는 시트로 AI 상담 (AI 상담 탭과 같은 대화)
//  - '작게 띄우기': 항상 위에 떠 있는 작은 창(Document Picture-in-Picture, 데스크톱 Chrome·Edge 116+).
//    아이사랑 같은 다른 사이트에서 신청하면서도 옆에 띄워 두고 물어볼 수 있다. 지원하지 않는 브라우저에서는 버튼을 숨긴다.
// 휴대폰에서 다른 앱 위에 떠 있는 '말풍선'은 웹으로는 만들 수 없어(안드로이드 네이티브 앱 필요), 홈 화면 설치 + 바로가기로 대신한다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AgentChat from "./AgentChat";

const POS_KEY = "careos:fab:v1";
const SIZE = 56;

/* eslint-disable @typescript-eslint/no-explicit-any */
const pipApi = () => (typeof window !== "undefined" ? (window as any).documentPictureInPicture : undefined);

/** 지금 문서의 스타일을 작은 창에 복사한다 (Tailwind 등) */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.createElement("style");
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

export default function FloatingAgent({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [canPip, setCanPip] = useState(false);
  // 버튼 위치: 오른쪽 가장자리 가운데쯤이 기본(목록 카드의 버튼을 가리지 않게). 끌어서 옮기면 이 기기에 기억한다
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    setCanPip(Boolean(pipApi()));
    setPos(loadPos());
  }, []);

  // 작은 창이 열려 있으면 시트는 닫는다. 페이지를 떠나면 작은 창도 닫는다
  useEffect(() => () => pip?.close(), [pip]);

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - SIZE - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - SIZE - 8),
  });

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp(e.clientX - d.dx, e.clientY - d.dy);
    const r = e.currentTarget.getBoundingClientRect();
    if (!d.moved && Math.hypot(next.x - r.left, next.y - r.top) < 6) return;
    d.moved = true;
    setPos(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        /* 기억 못 해도 괜찮다 */
      }
      return;
    }
    if (pip) pip.focus();
    else setOpen((o) => !o);
  };

  const openPip = async () => {
    try {
      const w: Window = await pipApi().requestWindow({ width: 400, height: 640 });
      copyStyles(w.document);
      w.document.title = "CareOS AI 상담";
      w.document.documentElement.lang = "ko";
      w.document.body.className = document.body.className;
      w.document.body.style.margin = "0";
      w.document.body.style.height = "100vh";
      w.addEventListener("pagehide", () => setPip(null));
      setPip(w);
      setOpen(false);
    } catch {
      /* 사용자가 막았거나 지원하지 않음 */
    }
  };

  const btn = "shrink-0 rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-600";
  const style = pos ? { left: pos.x, top: pos.y } : undefined;

  return (
    <>
      {!hidden && (
      <button
        type="button"
        aria-label={open ? "AI 상담 닫기" : "AI 상담 열기"}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={style}
        className={`fixed z-40 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg ring-4 ring-white/70 active:scale-95 ${
          pos ? "" : "top-[42vh] right-3"
        } ${pip ? "opacity-60" : ""}`}
      >
        {open ? "✕" : "💬"}
      </button>
      )}

      {open && !pip && !hidden && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="AI 상담"
            className="mx-auto h-[80vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AgentChat
              variant="sheet"
              actions={
                <>
                  {canPip && (
                    <button type="button" onClick={openPip} className={btn} title="다른 사이트를 보면서도 항상 위에 떠 있는 작은 창">
                      작게 띄우기
                    </button>
                  )}
                  <Link href="/agent" onClick={() => setOpen(false)} className={btn}>
                    크게
                  </Link>
                  <button type="button" onClick={() => setOpen(false)} className={btn} aria-label="닫기">
                    ✕
                  </button>
                </>
              }
            />
          </div>
        </div>
      )}

      {pip &&
        createPortal(
          <AgentChat
            variant="pip"
            actions={
              <button type="button" onClick={() => pip.close()} className={btn} aria-label="작은 창 닫기">
                ✕
              </button>
            }
          />,
          pip.document.body,
        )}
    </>
  );
}
