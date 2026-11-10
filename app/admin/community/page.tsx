"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { Card } from "@/components/PageShell";
import { useRegions } from "@/components/RegionPicker";
import { dongLabel } from "@/lib/regions";
import { api, secondaryBtn } from "@/lib/ui";

interface QueuedPost {
  id: string;
  nickname: string;
  emd_code: string;
  category: string;
  title: string;
  body: string;
  status: "pending" | "hidden";
  report_count: number;
  flags: string[];
  created_at: string;
}

/** 간단한 관리자 검토 화면: 검토 대기(링크·연락처) · 신고로 숨겨진 글 */
export default function AdminCommunity() {
  const regions = useRegions();
  const [posts, setPosts] = useState<QueuedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ posts: QueuedPost[] }>("/api/admin/community")
      .then((r) => setPosts(r.posts))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (id: string, action: "publish" | "hide" | "remove") => {
    if (action === "remove" && !confirm("완전히 삭제할까요?")) return;
    await api("/api/admin/community", { method: "POST", json: { id, action } }).catch((e) => setError(e.message));
    load();
  };

  return (
    <PageShell title="게시판 관리" back="/me" wide>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!posts ? (
        !error && <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">검토할 글이 없어요.</p>
      ) : (
        posts.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded px-1.5 py-0.5 ${p.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
                {p.status === "pending" ? `검토 대기 (${p.flags.join("·")})` : `숨김 · 신고 ${p.report_count}건`}
              </span>
              <span className="text-stone-500">
                {dongLabel(regions, p.emd_code)} · {p.nickname} · {new Date(p.created_at).toLocaleString("ko-KR")}
              </span>
            </div>
            <p className="font-semibold">{p.title}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-stone-700">{p.body}</p>
            <div className="flex gap-2">
              <button className={secondaryBtn} onClick={() => act(p.id, "publish")}>
                공개
              </button>
              {p.status !== "hidden" && (
                <button className={secondaryBtn} onClick={() => act(p.id, "hide")}>
                  숨김
                </button>
              )}
              <button className={`${secondaryBtn} text-red-600`} onClick={() => act(p.id, "remove")}>
                삭제
              </button>
            </div>
          </Card>
        ))
      )}
    </PageShell>
  );
}
