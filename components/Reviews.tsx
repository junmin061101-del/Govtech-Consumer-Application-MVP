"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteReview,
  MAX_TEXT,
  maskNickname,
  REVIEW_TAGS,
  saveReview,
  subscribeReviews,
  summarize,
  type Review,
} from "@/lib/reviews";
import { useAuth } from "./AuthProvider";

const Stars = ({ value }: { value: number }) => (
  <span aria-label={`별점 ${value}점`} className="tracking-tight text-amber-500">
    {"★".repeat(value)}
    <span className="text-stone-300">{"★".repeat(5 - value)}</span>
  </span>
);

const tagLabel = (id: string) => REVIEW_TAGS.find((t) => t.id === id)?.label ?? id;

export default function Reviews({ facilityId }: { facilityId: string }) {
  const { user, loading: authLoading, enabled, signIn } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setReviews(null);
    setError(null);
    return subscribeReviews(facilityId, setReviews, () => setError("리뷰를 불러오지 못했어요"));
  }, [facilityId, enabled]);

  const mine = useMemo(() => reviews?.find((r) => r.uid === user?.uid) ?? null, [reviews, user]);
  const { count, avg } = useMemo(() => summarize(reviews ?? []), [reviews]);

  if (!enabled) {
    return (
      <section className="border-t border-stone-100 pt-4">
        <h3 className="text-sm font-bold text-stone-900">리뷰</h3>
        <p className="mt-2 text-xs text-stone-500">리뷰 기능은 곧 열려요.</p>
      </section>
    );
  }

  return (
    <section className="border-t border-stone-100 pt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-stone-900">리뷰 {reviews ? count : ""}</h3>
        {count > 0 && (
          <span className="text-sm">
            <span className="text-amber-500">★</span> <b>{avg.toFixed(1)}</b>
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!reviews && !error && <p className="mt-2 text-xs text-stone-500">불러오는 중…</p>}

      {reviews && reviews.length === 0 && (
        <p className="mt-2 text-xs text-stone-500">아직 리뷰가 없어요. 첫 리뷰를 남겨 보세요.</p>
      )}

      <ul className="mt-3 space-y-3">
        {reviews?.map((r) => (
          <li key={r.id} className="rounded-xl bg-stone-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-stone-800">
                {maskNickname(r.nickname)}
                {r.uid === user?.uid && <span className="ml-1 text-xs text-emerald-700">(내 리뷰)</span>}
              </span>
              <span className="text-xs text-stone-400">{r.updatedAt?.toLocaleDateString("ko-KR") ?? "방금"}</span>
            </div>
            <div className="mt-0.5 text-sm">
              <Stars value={r.rating} />
            </div>
            {r.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <span key={t} className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-600">
                    {tagLabel(t)}
                  </span>
                ))}
              </div>
            )}
            {r.text && <p className="mt-1.5 whitespace-pre-wrap break-words text-stone-700">{r.text}</p>}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {authLoading ? null : user ? (
          // key 로 시설·내 리뷰가 바뀔 때 폼 상태를 새로 시작한다
          <ReviewForm key={`${facilityId}:${mine?.id ?? "new"}`} facilityId={facilityId} mine={mine} user={user} />
        ) : (
          <button
            onClick={signIn}
            className="w-full rounded-xl bg-[#FEE500] px-4 py-3 text-center text-sm font-semibold text-[#191919]"
          >
            카카오로 로그인하고 리뷰 남기기
          </button>
        )}
      </div>
    </section>
  );
}

function ReviewForm({
  facilityId,
  mine,
  user,
}: {
  facilityId: string;
  mine: Review | null;
  user: { uid: string; nickname: string };
}) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(mine?.tags ?? []);
  const [text, setText] = useState(mine?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggleTag = (id: string) => setTags((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));

  const submit = async () => {
    if (rating < 1) return setMsg("별점을 골라 주세요");
    setBusy(true);
    setMsg(null);
    try {
      await saveReview({ facilityId, uid: user.uid, nickname: user.nickname, rating, text, tags });
      setMsg(mine ? "리뷰를 수정했어요" : "리뷰를 남겼어요. 고마워요!");
    } catch {
      setMsg("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("내 리뷰를 삭제할까요?")) return;
    setBusy(true);
    try {
      await deleteReview(facilityId, user.uid);
    } catch {
      setMsg("삭제하지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 p-3">
      <p className="text-sm font-semibold text-stone-800">{mine ? "내 리뷰 수정" : "리뷰 남기기"}</p>

      <div className="flex gap-1" role="radiogroup" aria-label="별점">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}점`}
            onClick={() => setRating(n)}
            className={`text-3xl leading-none ${n <= rating ? "text-amber-500" : "text-stone-300"}`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REVIEW_TAGS.map((t) => (
          <button
            key={t.id}
            onClick={() => toggleTag(t.id)}
            aria-pressed={tags.includes(t.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              tags.includes(t.id) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-300 text-stone-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={3}
          placeholder="이용해 본 경험을 자유롭게 적어 주세요 (선택)"
          className="w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
        />
        <p className="text-right text-xs text-stone-400">
          {text.length}/{MAX_TEXT}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-stone-500">
        직접 이용한 경험만 적어 주세요. 특정인의 이름·연락처 등 개인정보나 근거 없는 비방은 삭제될 수 있어요.
      </p>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {mine ? "수정하기" : "등록하기"}
        </button>
        {mine && (
          <button onClick={remove} disabled={busy} className="rounded-xl border border-stone-300 px-4 text-sm text-stone-600">
            삭제
          </button>
        )}
      </div>
      {msg && (
        <p className="text-xs text-stone-600" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
