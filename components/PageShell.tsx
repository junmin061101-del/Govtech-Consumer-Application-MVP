"use client";

import Link from "next/link";

/** 지도 밖 화면(가입·내 정보·도우미·게시판 등)의 공통 틀 */
export default function PageShell({
  title,
  back = "/",
  children,
  wide = false,
}: {
  title: string;
  back?: string | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
        <div className={`mx-auto flex items-center gap-2 px-4 py-3 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
          {back && (
            <Link href={back} aria-label="뒤로" className="-ml-2 rounded-full p-2 text-stone-500 hover:bg-stone-100">
              ←
            </Link>
          )}
          <h1 className="text-base font-bold tracking-tight">{title}</h1>
        </div>
      </header>
      <div className={`mx-auto space-y-4 px-4 py-4 ${wide ? "max-w-3xl" : "max-w-lg"}`}>{children}</div>
    </main>
  );
}

export function Card({ title, children, id }: { title?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      {title && <h2 className="text-sm font-bold text-stone-900">{title}</h2>}
      {children}
    </section>
  );
}
