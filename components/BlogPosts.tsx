"use client";

// 네이버 블로그 검색 결과를 누를 때만 불러와 그대로 보여 준다.
// 약관상 결과는 저장하지 않고(메모리에만), AI 상담 기록에도 넣지 않는다. 순서·내용을 바꾸지 않고 출처·원문 링크를 단다.
import { useState } from "react";
import { reviewLinks } from "@/lib/reviewLinks";
import { api } from "@/lib/ui";

interface Post {
  title: string;
  description: string;
  link: string;
  blogger: string;
  postdate: string;
}

export default function BlogPosts({ name, address = "" }: { name: string; address?: string }) {
  const [state, setState] = useState<{ posts: Post[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = reviewLinks({ name, address })[0].url;

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await api<{ posts: Post[]; total: number }>(`/api/reviews/blog?q=${encodeURIComponent(name)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-center text-xs font-medium text-stone-800 disabled:opacity-50"
        >
          {busy ? "블로그 글 불러오는 중…" : "📝 네이버 블로그 글 바로 보기"}
        </button>
        {error && (
          <p className="text-[11px] text-red-600">
            {error} ·{" "}
            <a href={more} target="_blank" rel="noopener noreferrer" className="underline">
              네이버에서 보기
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
      <p className="text-[11px] font-semibold text-stone-600">네이버 블로그 검색 결과 · &lsquo;{name}&rsquo;</p>
      {state.posts.length === 0 ? (
        <p className="text-xs text-stone-500">검색된 블로그 글이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {state.posts.map((p) => (
            <li key={p.link} className="rounded-lg bg-white p-2">
              <a href={p.link} target="_blank" rel="noopener noreferrer" className="block text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline">
                {p.title} ↗
              </a>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-600">{p.description}</p>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {p.blogger}
                {p.postdate && ` · ${p.postdate}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] leading-snug text-stone-400">
        출처: 네이버 블로그 (NAVER API HUB 검색, 네이버가 보여 준 순서 그대로). 개인 의견이며 협찬 글이나 이 시설과 관계없는 글이 섞일 수
        있어요.{" "}
        <a href={more} target="_blank" rel="noopener noreferrer" className="underline">
          네이버에서 더 보기 ({state.total.toLocaleString()}건)
        </a>
      </p>
    </div>
  );
}
