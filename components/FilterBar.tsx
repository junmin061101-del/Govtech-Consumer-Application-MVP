"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type PlaceHit } from "@/lib/kakao";
import { DONGJAK_CENTER, QUICK_PLACES } from "@/lib/places";
import { walkMinToM } from "@/lib/filter";
import type { Day, Filters } from "@/lib/types";

type Section = "age" | "time" | "place";

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  pickMode: boolean;
  onPickMode: (on: boolean) => void;
  resultCount: number;
  /** 조건을 바꿨지만 아직 검색을 누르지 않은 상태 */
  dirty: boolean;
  onSearch: () => void;
}

const DAYS: { id: Day; label: string }[] = [
  { id: "weekday", label: "평일" },
  { id: "sat", label: "토요일" },
  { id: "sun", label: "일요일" },
];

const WALK = [5, 10, 15];

const TIMES = Array.from({ length: 37 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

const dayLabel = (d: Day) => DAYS.find((x) => x.id === d)!.label;
const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm transition ${
    on
      ? "border-emerald-600 bg-emerald-600 font-semibold text-white"
      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
  }`;

export default function FilterBar({
  filters,
  onChange,
  pickMode,
  onPickMode,
  resultCount,
  dirty,
  onSearch,
}: Props) {
  const [open, setOpen] = useState<Section | null>(null);

  const toggle = (s: Section) => {
    setOpen((cur) => (cur === s ? null : s));
    if (s !== "place") onPickMode(false);
  };

  const search = () => {
    onSearch();
    onPickMode(false);
    setOpen(null);
  };

  const walkMin = Math.round(filters.radiusM / 67);

  return (
    <div className="border-b border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-base font-bold tracking-tight text-stone-900">
          CareOS <span className="font-medium text-stone-500">동작구 돌봄지도</span>
        </h1>
        <span className="text-xs text-stone-500" aria-live="polite">
          {dirty ? (
            <span className="font-medium text-amber-700">조건이 바뀌었어요 · 검색을 눌러 주세요</span>
          ) : (
            <>
              이용 가능 <b className="text-emerald-700">{resultCount}</b>곳
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
          <SummaryChip active={open === "age"} filled={filters.age !== null} onClick={() => toggle("age")}>
            {filters.age === null ? "아이 나이" : `만 ${filters.age}세`}
          </SummaryChip>
          <SummaryChip active={open === "time"} filled onClick={() => toggle("time")}>
            {dayLabel(filters.day)} {filters.start}–{filters.end}
          </SummaryChip>
          <SummaryChip active={open === "place"} filled={!!filters.center} onClick={() => toggle("place")}>
            {filters.center ? `${filters.center.label} · 도보 ${walkMin}분` : "선호 위치"}
          </SummaryChip>
        </div>
        <button
          onClick={search}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-white ${
            dirty ? "bg-emerald-600 ring-2 ring-emerald-200" : "bg-emerald-600"
          }`}
        >
          검색
        </button>
      </div>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3">
          {open === "age" && (
            <div>
              <p className="mb-2 text-xs text-stone-500">만 나이 기준으로 해당 연령 반이 있는 어린이집만 보여줘요.</p>
              <div className="flex flex-wrap gap-2">
                <button className={chip(filters.age === null)} onClick={() => onChange({ age: null })}>
                  전체
                </button>
                {[0, 1, 2, 3, 4, 5].map((a) => (
                  <button key={a} className={chip(filters.age === a)} onClick={() => onChange({ age: a })}>
                    만 {a}세
                  </button>
                ))}
              </div>
            </div>
          )}

          {open === "time" && <TimeSection filters={filters} onChange={onChange} />}

          {open === "place" && (
            <PlaceSection filters={filters} onChange={onChange} pickMode={pickMode} onPickMode={onPickMode} />
          )}

          <button
            onClick={search}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white hover:bg-emerald-700"
          >
            이 조건으로 검색
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  children,
  active,
  filled,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  filled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${
        active
          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
          : filled
            ? "border-stone-800 bg-stone-900 text-white"
            : "border-stone-300 bg-white text-stone-600"
      }`}
    >
      {children} <span aria-hidden>▾</span>
    </button>
  );
}

function TimeSection({ filters, onChange }: Pick<Props, "filters" | "onChange">) {
  const setStart = (start: string) => {
    const idx = TIMES.indexOf(start);
    onChange({ start, ...(TIMES.indexOf(filters.end) <= idx ? { end: TIMES[Math.min(idx + 2, TIMES.length - 1)] } : {}) });
  };
  const setEnd = (end: string) => {
    const idx = TIMES.indexOf(end);
    onChange({ end, ...(TIMES.indexOf(filters.start) >= idx ? { start: TIMES[Math.max(idx - 2, 0)] } : {}) });
  };
  const select = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {DAYS.map((d) => (
          <button key={d.id} className={chip(filters.day === d.id)} onClick={() => onChange({ day: d.id })}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="시작 시간" className={select} value={filters.start} onChange={(e) => setStart(e.target.value)}>
          {TIMES.slice(0, -1).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-stone-400">~</span>
        <select aria-label="종료 시간" className={select} value={filters.end} onChange={(e) => setEnd(e.target.value)}>
          {TIMES.slice(1).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-stone-500">
        평일 07:30~19:30 밖(야간·휴일)은 야간연장형·휴일보육 어린이집만 표시돼요. 정확한 운영 시간은 시설에 확인해 주세요.
      </p>
    </div>
  );
}

function PlaceSection({ filters, onChange, pickMode, onPickMode }: Pick<Props, "filters" | "onChange" | "pickMode" | "onPickMode">) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      searchPlaces(q, DONGJAK_CENTER)
        .then((r) => id === seq.current && setHits(r))
        .catch(() => id === seq.current && setMsg("장소 검색을 사용할 수 없어요 (카카오맵 키 확인)"));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const useHere = () => {
    setMsg(null);
    if (!navigator.geolocation) return setMsg("이 브라우저에서는 위치를 가져올 수 없어요");
    navigator.geolocation.getCurrentPosition(
      (p) => onChange({ center: { lat: p.coords.latitude, lng: p.coords.longitude, label: "내 위치" } }),
      () => setMsg("위치 권한이 필요해요"),
      { timeout: 8000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="집·직장·역 이름 검색 (예: 노량진역)"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
        />
        {hits.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg">
            {hits.map((h) => (
              <li key={`${h.label}${h.lat}`}>
                <button
                  className="block w-full px-3 py-2 text-left hover:bg-stone-50"
                  onClick={() => {
                    onChange({ center: { lat: h.lat, lng: h.lng, label: h.label } });
                    setQ("");
                    setHits([]);
                  }}
                >
                  <span className="block text-sm font-medium text-stone-900">{h.label}</span>
                  <span className="block text-xs text-stone-500">{h.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_PLACES.map((p) => (
          <button
            key={p.label}
            className={chip(filters.center?.label === p.label)}
            onClick={() => onChange({ center: { lat: p.lat, lng: p.lng, label: p.label } })}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={chip(false)} onClick={useHere}>
          📍 내 위치
        </button>
        <button className={chip(pickMode)} onClick={() => onPickMode(!pickMode)}>
          🗺 지도에서 찍기
        </button>
        {filters.center && (
          <button className={chip(false)} onClick={() => onChange({ center: null })}>
            위치 해제
          </button>
        )}
      </div>
      {pickMode && <p className="text-xs text-emerald-700">지도를 탭하면 그 위치가 선택돼요.</p>}
      {msg && <p className="text-xs text-red-600">{msg}</p>}

      <div>
        <p className="mb-1.5 text-xs text-stone-500">이동 범위</p>
        <div className="flex gap-2">
          {WALK.map((m) => (
            <button
              key={m}
              className={chip(Math.round(filters.radiusM / 67) === m)}
              onClick={() => onChange({ radiusM: walkMinToM(m) })}
            >
              도보 {m}분
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
