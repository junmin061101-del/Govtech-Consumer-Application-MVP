"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import PageShell, { Card } from "@/components/PageShell";
import { DongPicker, useRegions } from "@/components/RegionPicker";
import { CATEGORIES, type Category } from "@/lib/community";
import { dongLabel } from "@/lib/regions";
import type { Day } from "@/lib/types";
import { api, chip, input, primaryBtn, secondaryBtn, select, TIMES } from "@/lib/ui";


const DAYS: { id: Day; label: string }[] = [
  { id: "weekday", label: "평일" },
  { id: "sat", label: "토요일" },
  { id: "sun", label: "일요일" },
];

interface PostView {
  id: string;
  nickname: string;
  category: Category;
  title: string;
  body: string;
  need: { day: Day; start: string; end: string; age: number | null } | null;
  status: "published" | "pending" | "hidden";
  created_at: string;
  mine: boolean;
  reported: boolean;
}

const catLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export default function Community() {
  const { profile, flags, loading } = useAuth();
  if (loading || !profile) return <PageShell title="동네 커뮤니티" back={null}>불러오는 중…</PageShell>;
  if (!flags.community) return <PageShell title="동네 커뮤니티" back={null}>아직 열리지 않은 기능이에요.</PageShell>;
  return <Board home={profile.interestDongs} />;
}

function Board({ home }: { home: string[] }) {
  const regions = useRegions();
  const [emd, setEmd] = useState(home[0]);
  const [browse, setBrowse] = useState(false);
  const [category, setCategory] = useState<Category | "">("");
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setPosts(null);
    api<{ posts: PostView[] }>(`/api/community/posts?emd=${emd}${category ? `&category=${category}` : ""}`)
      .then((r) => setPosts(r.posts))
      .catch((e) => setMsg(e.message));
  }, [emd, category]);
  useEffect(load, [load]);

  const report = async (id: string) => {
    if (!confirm("이 글을 신고할까요? 신고가 쌓이면 자동으로 숨겨져요.")) return;
    try {
      await api(`/api/community/posts/${id}`, { method: "POST" });
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    if (!confirm("내 글을 삭제할까요?")) return;
    await api(`/api/community/posts/${id}`, { method: "DELETE" }).catch((e) => setMsg(e.message));
    load();
  };

  return (
    <PageShell title="동네 커뮤니티" back={null}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {home.map((c) => (
            <button key={c} className={chip(emd === c)} onClick={() => setEmd(c)}>
              {dongLabel(regions, c)}
            </button>
          ))}
          {!home.includes(emd) && <span className={chip(true)}>{dongLabel(regions, emd)}</span>}
          <button className="text-xs text-stone-500 underline" onClick={() => setBrowse((v) => !v)}>
            다른 동 보기
          </button>
        </div>
        {browse && (
          <DongPicker
            value={[emd]}
            onChange={(v) => {
              if (v[0]) {
                setEmd(v[0]);
                setBrowse(false);
              }
            }}
          />
        )}
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button className={`${chip(category === "")} shrink-0`} onClick={() => setCategory("")}>
            전체
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`${chip(category === c.id)} shrink-0`} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {writing ? (
        <Compose
          emd={emd}
          emdName={dongLabel(regions, emd)}
          onDone={(m) => {
            setWriting(false);
            setMsg(m);
            load();
          }}
          onCancel={() => setWriting(false)}
        />
      ) : (
        <button className={primaryBtn} onClick={() => setWriting(true)}>
          {dongLabel(regions, emd)}에 글쓰기
        </button>
      )}
      {msg && <p className="text-sm text-stone-700" role="status">{msg}</p>}

      {!posts ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">아직 글이 없어요. 첫 글을 남겨 보세요.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                  <span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">{catLabel(p.category)}</span> {p.nickname}
                  </span>
                  <span>{new Date(p.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
                {p.status === "pending" && (
                  <p className="text-xs text-amber-700">링크·연락처가 있어 검토 후 공개돼요 (나에게만 보여요)</p>
                )}
                <p className="font-semibold">{p.title}</p>
                {p.need && (
                  <p className="text-xs text-emerald-700">
                    {DAYS.find((d) => d.id === p.need!.day)?.label} {p.need.start}~{p.need.end}
                    {p.need.age !== null ? ` · 만 ${p.need.age}세` : ""}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm text-stone-700">{p.body}</p>
                <div className="flex justify-end gap-3 text-xs text-stone-500">
                  {p.mine ? (
                    <button className="underline" onClick={() => remove(p.id)}>
                      삭제
                    </button>
                  ) : p.reported ? (
                    <span>신고함</span>
                  ) : (
                    <button className="underline" onClick={() => report(p.id)}>
                      신고
                    </button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function Compose({ emd, emdName, onDone, onCancel }: { emd: string; emdName: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const [category, setCategory] = useState<Category>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [day, setDay] = useState<Day>("weekday");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("21:00");
  const [age, setAge] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ post: PostView }>("/api/community/posts", {
        method: "POST",
        json: { emd_code: emd, category, title, body, need: category === "need_care" ? { day, start, end, age } : null },
      });
      onDone(r.post.status === "pending" ? "링크·연락처가 있어 관리자 검토 후 공개돼요." : "글을 올렸어요.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title={`${emdName}에 글쓰기`}>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={chip(category === c.id)} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {category === "need_care" && (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <p className="text-xs text-stone-600">필요한 시간·연령은 동네 돌봄 수요 통계에 쓰여요 (본문은 쓰이지 않아요).</p>
          <div className="flex gap-2">
            {DAYS.map((d) => (
              <button key={d.id} className={chip(day === d.id)} onClick={() => setDay(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="시작 시간" className={select} value={start} onChange={(e) => setStart(e.target.value)}>
              {TIMES.slice(0, -1).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="text-stone-400">~</span>
            <select aria-label="종료 시간" className={select} value={end} onChange={(e) => setEnd(e.target.value)}>
              {TIMES.slice(1).filter((t) => t > start).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select aria-label="아이 나이" className={select} value={age ?? ""} onChange={(e) => setAge(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">나이 선택 안 함</option>
              {Array.from({ length: 9 }, (_, a) => (
                <option key={a} value={a}>
                  만 {a}세
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <input className={input} maxLength={60} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${input} resize-none`}
        rows={5}
        maxLength={1000}
        placeholder="내용 (아이 이름·얼굴 사진·전화번호·상세 주소는 적지 마세요)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <p className="text-xs text-stone-500">
        자동으로 만든 익명 닉네임으로 올라가요. 링크·연락처가 있으면 검토 후 공개되고, 신고가 쌓이면 숨겨져요. 사진은 아직 올릴 수
        없어요.
      </p>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className={`${secondaryBtn} flex-1`} onClick={onCancel}>
          취소
        </button>
        <button className={`${primaryBtn} flex-1`} disabled={busy || !title.trim() || !body.trim()} onClick={submit}>
          올리기
        </button>
      </div>
    </Card>
  );
}
