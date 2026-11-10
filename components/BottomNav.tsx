"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Flags } from "@/lib/flags";

// 하단 탭바. 가입을 마친 회원 화면에만 보인다 (AuthProvider 가 그린다).
// 높이는 globals.css 의 --tabbar-h 와 맞춘다.

const Icon = {
  map: (
    <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5" strokeLinejoin="round" />
  ),
  chat: (
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5v-9ZM8 9h8M8 12h5" strokeLinejoin="round" strokeLinecap="round" />
  ),
  community: (
    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 8a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M17.5 13.5A5.5 5.5 0 0 1 20.5 19" strokeLinecap="round" />
  ),
  me: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" strokeLinecap="round" />,
};

type Tab = { href: string; label: string; icon: keyof typeof Icon; flag?: keyof Flags };

const TABS: Tab[] = [
  { href: "/", label: "지도", icon: "map" },
  { href: "/agent", label: "AI 상담", icon: "chat", flag: "agent" },
  { href: "/community", label: "동네 커뮤니티", icon: "community", flag: "community" },
  { href: "/me", label: "내 정보", icon: "me" },
];

/** 탭바를 보여 줄 화면 */
export const TABBED_PATHS = ["/", "/agent", "/community", "/me"];

export default function BottomNav({ flags }: { flags: Flags }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 max-w-2xl">
        {TABS.filter((t) => !t.flag || flags[t.flag]).map((t) => {
          const on = path === t.href;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  on ? "text-stone-900" : "text-stone-400"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} aria-hidden>
                  {Icon[t.icon]}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
