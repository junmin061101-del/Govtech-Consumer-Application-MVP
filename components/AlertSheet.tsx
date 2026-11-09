"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIND_META } from "@/lib/kinds";
import type { Day, FacilityKind } from "@/lib/types";
import { api, primaryBtn, secondaryBtn } from "@/lib/ui";
import { DongPicker } from "./RegionPicker";

export type AlertDraft =
  | { type: "facility"; facilityId: string; facilityName: string }
  | {
      type: "condition";
      center: { lat: number; lng: number } | null;
      day: Day;
      start: string;
      end: string;
      age: number | null;
      kinds: FacilityKind[];
      fallbackDong: string | null;
    };

const DAY: Record<Day, string> = { weekday: "평일", sat: "토요일", sun: "일요일" };

/** 빈자리 알림 등록 확인 시트. 조건 알림은 행정동 단위로 등록한다. */
export default function AlertSheet({ draft, onClose }: { draft: AlertDraft; onClose: () => void }) {
  const [dong, setDong] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 조건 알림: 선호 위치 좌표 → 행정동 (서버 변환). 실패하면 관심 지역 첫 동
  useEffect(() => {
    if (draft.type !== "condition") return;
    const fallback = draft.fallbackDong ? [draft.fallbackDong] : [];
    if (!draft.center) return setDong(fallback);
    api<{ emdCode: string }>(`/api/regions/locate?lat=${draft.center.lat}&lng=${draft.center.lng}`)
      .then((r) => setDong([r.emdCode]))
      .catch(() => setDong(fallback));
  }, [draft]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const target =
        draft.type === "facility"
          ? draft
          : { type: "condition", emdCode: dong[0], day: draft.day, start: draft.start, end: draft.end, age: draft.age, kinds: draft.kinds };
      await api("/api/alerts", { method: "POST", json: { target } });
      setDone(true);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="빈자리 알림 받기"
        className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">빈자리 알림 받기</h2>
        {done ? (
          <>
            <p className="text-sm text-stone-700">
              등록했어요. 매일 공개자료의 정원·현원 변화를 확인해 자리가 생겼을 수 있으면 하루 한 번까지 알려 드려요. 알림은
              90일 동안 받을 수 있고 언제든 해지할 수 있어요.
            </p>
            <div className="flex gap-2">
              <Link href="/me#alerts" className={`${secondaryBtn} flex-1`}>
                내 알림 보기
              </Link>
              <button className={`${primaryBtn} flex-1`} onClick={onClose}>
                확인
              </button>
            </div>
          </>
        ) : (
          <>
            {draft.type === "facility" ? (
              <p className="text-sm text-stone-700">
                <b>{draft.facilityName}</b>에 자리가 생겼을 수 있으면 알려 드려요.
              </p>
            ) : (
              <div className="space-y-2 text-sm text-stone-700">
                <p>
                  <b>
                    {DAY[draft.day]} {draft.start}~{draft.end}
                    {draft.age !== null ? ` · 만 ${draft.age}세` : ""}
                    {draft.kinds.length ? ` · ${draft.kinds.map((k) => KIND_META[k].label).join("·")}` : ""}
                  </b>{" "}
                  조건에 맞는 시설에 자리가 생기면 알려 드려요.
                </p>
                <p className="text-xs text-stone-500">알림 받을 동</p>
                <DongPicker value={dong} onChange={setDong} />
              </div>
            )}
            <p className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600">
              계정당 3개까지 · 90일 동안 · 알림톡 수신 동의와 휴대폰 인증을 했다면 알림톡으로, 아니면 앱 알림함으로 보내요.
              공개자료 기준이라 자리 여부는 시설에 꼭 확인해 주세요.
            </p>
            {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
            <div className="flex gap-2">
              <button className={`${secondaryBtn} flex-1`} onClick={onClose}>
                취소
              </button>
              <button className={`${primaryBtn} flex-1`} disabled={busy || (draft.type === "condition" && dong.length === 0)} onClick={submit}>
                알림 받기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
