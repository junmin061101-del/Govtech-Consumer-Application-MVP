"use client";

import { useState } from "react";
import type { Combo } from "@/lib/combos";
import { KIND_META } from "@/lib/kinds";
import { availability } from "@/lib/status";
import type { Facility, Match } from "@/lib/types";
import { chip } from "@/lib/ui";
import type { WidenStep } from "@/lib/widen";
import Reviews from "./Reviews";
import BlogPosts from "./BlogPosts";
import { reviewLinks } from "@/lib/reviewLinks";

import { facts, features, fmtDist, MAX_COMPARE, weekdayHours } from "@/lib/facilityFacts";

/** 비교 담기 상태 (지도 홈이 갖고 있고 목록·상세가 같이 쓴다) */
export interface CompareState {
  ids: string[];
  toggle: (id: string) => void;
}

/** 대시보드 요약 타일: 조건에 맞는 곳·이용 가능·야간/주말·정원 찬 곳 */
export function SummaryTiles({ matches, full }: { matches: Match[]; full: Match[] }) {
  const available = matches.filter((m) => availability(m.facility).status === "available").length;
  const extended = matches.filter((m) => features(m.facility).length > 0).length;
  const near = matches.filter((m) => m.distanceM !== null && m.distanceM <= 500).length;
  const tiles = [
    { label: "조건에 맞는 곳", value: matches.length, tone: "text-stone-900" },
    { label: "이용 가능 확인", value: available, tone: "text-emerald-700" },
    { label: "야간·주말 운영", value: extended, tone: "text-violet-700" },
    full.length > 0 ? { label: "정원 찬 곳", value: full.length, tone: "text-amber-700" } : { label: "500m 안", value: near, tone: "text-sky-700" },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-stone-200 bg-white px-2 py-2 shadow-sm">
          <dt className="truncate text-[10px] text-stone-500">{t.label}</dt>
          <dd className={`text-lg font-bold leading-tight ${t.tone}`}>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CompareToggle({ id, compare }: { id: string; compare?: CompareState }) {
  if (!compare) return null;
  const on = compare.ids.includes(id);
  const full = !on && compare.ids.length >= MAX_COMPARE;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={full}
      title={full ? `최대 ${MAX_COMPARE}곳까지 비교할 수 있어요` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        compare.toggle(id);
      }}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-40 ${
        on ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 text-stone-600"
      }`}
    >
      {on ? "✓ 비교" : "+ 비교"}
    </button>
  );
}

export function StatusBadge({ facility }: { facility: Facility }) {
  const a = availability(facility);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
        a.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      {a.label}
      {a.asOf && <span className="font-normal text-stone-500"> · {a.asOf} 기준</span>}
    </span>
  );
}

function Row({
  m,
  selected,
  onSelect,
  showBadge,
  compare,
}: {
  m: Match;
  selected: boolean;
  onSelect: (id: string) => void;
  showBadge: boolean;
  compare?: CompareState;
}) {
  const { facility: f, distanceM } = m;
  const cap = f.capacity !== null && f.enrolled !== null ? `정원 ${f.capacity} · 현원 ${f.enrolled}` : f.capacity !== null ? `정원 ${f.capacity}` : null;
  const feats = features(f);
  return (
    <li className="relative px-3 py-1.5">
      {/* 카드(시설 열기)와 비교 버튼은 형제로 둔다: 버튼을 카드 안에 넣으면 누를 때 카드까지 열린다 */}
      <button
        type="button"
        onClick={() => onSelect(f.id)}
        className={`flex w-full items-center gap-3 rounded-xl border bg-white py-2.5 pl-3 text-left shadow-sm transition hover:border-emerald-300 ${
          compare ? "pr-20" : "pr-3"
        } ${selected ? "border-emerald-500 ring-1 ring-emerald-500" : "border-stone-200"}`}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
          style={{ background: KIND_META[f.kind].color }}
          title={f.vacancy !== null ? `빈자리(추정) ${f.vacancy}명` : KIND_META[f.kind].label}
        >
          {f.vacancy ?? KIND_META[f.kind].short}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-stone-900">{f.name}</span>
            {fmtDist(distanceM) && <span className="shrink-0 text-[11px] text-stone-400">{fmtDist(distanceM)}</span>}
          </span>
          <span className="block truncate text-xs text-stone-500">
            {KIND_META[f.kind].label}
            {f.kind === "daycare" && f.type ? ` (${f.type})` : ""} · {f.address.replace("서울특별시 ", "")}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            {showBadge && <StatusBadge facility={f} />}
            {cap && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{cap}</span>}
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">평일 {weekdayHours(f).replace(" (기본 보육시간)", "")}</span>
            {feats.map((x) => (
              <span key={x} className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                {x}
              </span>
            ))}
          </span>
        </span>
      </button>
      <span className="absolute right-6 top-1/2 -translate-y-1/2">
        <CompareToggle id={f.id} compare={compare} />
      </span>
    </li>
  );
}

export function ResultList({
  matches,
  full,
  combos,
  widen,
  selectedId,
  onSelect,
  onWiden,
  onAlert,
  showBadge,
  compare,
}: {
  matches: Match[];
  /** 정원이 찬 시설 (빈자리 알림 대상). 기능이 꺼져 있으면 빈 배열 */
  full: Match[];
  combos: Combo[];
  /** 결과 없음 화면의 '범위 넓혀 다시 찾기' 선택지 */
  widen: WidenStep[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onWiden: (step: WidenStep) => void;
  /** 조건으로 빈자리 알림 받기. null 이면 숨김 */
  onAlert: (() => void) | null;
  showBadge: boolean;
  compare?: CompareState;
}) {
  const [showFull, setShowFull] = useState(false);

  if (matches.length === 0) {
    return (
      <div className="space-y-4 px-4 py-6 text-sm text-stone-600">
        {combos.length > 0 ? (
          <ComboList combos={combos} onSelect={onSelect} />
        ) : (
          <div className="text-center">
            <p className="font-semibold text-stone-800">조건에 맞는 곳이 없어요</p>
            <p className="mt-1">야간·주말은 운영 정보가 확인된 시설만 보여요.</p>
          </div>
        )}
        {widen.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500">범위 넓혀 다시 찾기</p>
            <div className="flex flex-wrap gap-2">
              {widen.map((w) => (
                <button key={w.dimension} className={chip(false)} onClick={() => onWiden(w)}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {onAlert && (
          <button onClick={onAlert} className="block w-full rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white">
            🔔 이 조건으로 빈자리 알림 받기
          </button>
        )}
        {full.length > 0 && <FullList full={full} selectedId={selectedId} onSelect={onSelect} compare={compare} />}
      </div>
    );
  }
  return (
    <>
      <SummaryTiles matches={matches} full={full} />
      <ul className="py-1.5">
        {matches.map((m) => (
          <Row key={m.facility.id} m={m} selected={m.facility.id === selectedId} onSelect={onSelect} showBadge={showBadge} compare={compare} />
        ))}
      </ul>
      {full.length > 0 && (
        <div className="border-t border-stone-200 px-4 py-3">
          <button className="text-xs font-medium text-stone-600" onClick={() => setShowFull((v) => !v)}>
            정원이 찬 곳 {full.length}곳 {showFull ? "접기 ▴" : "보기 ▾"} · 빈자리 알림을 받을 수 있어요
          </button>
          {showFull && <FullList full={full} selectedId={selectedId} onSelect={onSelect} compare={compare} />}
        </div>
      )}
    </>
  );
}

function FullList({
  full,
  selectedId,
  onSelect,
  compare,
}: {
  full: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  compare?: CompareState;
}) {
  return (
    <ul className="-mx-3 mt-2">
      {full.slice(0, 30).map((m) => (
        <Row key={m.facility.id} m={m} selected={m.facility.id === selectedId} onSelect={onSelect} showBadge compare={compare} />
      ))}
    </ul>
  );
}

function ComboList({ combos, onSelect }: { combos: Combo[]; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold text-stone-800">한 곳으로는 어렵지만, 두 곳을 이어서 맡길 수 있어요</p>
      <ul className="space-y-2">
        {combos.map((c) => (
          <li key={`${c.first.id}-${c.second.id}`} className="rounded-xl border border-stone-200 bg-white p-3">
            <button className="block w-full text-left" onClick={() => onSelect(c.first.id)}>
              <span className="text-xs text-stone-500">~{c.handoff}</span>{" "}
              <span className="font-semibold text-stone-900">{c.first.name}</span>
            </button>
            <p className="my-1 pl-3 text-xs text-stone-500">↓ 도보 약 {c.transferMin}분 ({fmtDist(c.transferM)}, 직선거리 기준)</p>
            <button className="block w-full text-left" onClick={() => onSelect(c.second.id)}>
              <span className="text-xs text-stone-500">{c.handoff}~</span>{" "}
              <span className="font-semibold text-stone-900">{c.second.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-stone-500">이동은 보호자가 맡는다고 가정했어요. 두 시설 모두 운영 시간을 꼭 확인해 주세요.</p>
    </div>
  );
}

export function FacilityDetail({
  match,
  age,
  onClose,
  onAlert,
  compare,
}: {
  match: Match;
  age: number | null;
  onClose: () => void;
  /** 이 시설 빈자리 알림 받기. null 이면 숨김 */
  onAlert: (() => void) | null;
  compare?: CompareState;
}) {
  const [more, setMore] = useState(false);
  const { facility: f, hours } = match;
  const meta = KIND_META[f.kind];
  const dial = f.phone.replace(/[^0-9+]/g, "");
  const btn = "flex-1 rounded-xl border border-stone-300 px-3 py-2.5 text-center text-sm font-medium text-stone-800";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
            style={{ background: meta.color }}
          >
            {meta.label}
          </span>
          {f.kind === "daycare" && f.type && (
            <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{f.type}</span>
          )}
          <h2 className="mt-1 text-lg font-bold leading-tight text-stone-900">{f.name}</h2>
          <p className="mt-0.5 text-sm text-stone-500">{f.address.replace("서울특별시 ", "")}</p>
          <div className="mt-1">
            <StatusBadge facility={f} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CompareToggle id={f.id} compare={compare} />
          <button onClick={onClose} aria-label="닫기" className="-mr-1 rounded-full p-2 text-stone-500 hover:bg-stone-100">
            ✕
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 text-sm">
        <div>
          <dt className="text-xs text-stone-500">빈자리{f.vacancy !== null && "(추정)"}</dt>
          {f.vacancy !== null ? (
            <>
              <dd className="text-xl font-bold text-emerald-700">{f.vacancy}명</dd>
              <dd className="text-xs text-stone-500">
                정원 {f.capacity} / 현원 {f.enrolled}
              </dd>
            </>
          ) : (
            <>
              <dd className="text-base font-bold text-stone-700">정보 없음</dd>
              <dd className="text-xs text-stone-500">시설에 직접 문의해 주세요</dd>
            </>
          )}
        </div>
        <div>
          <dt className="text-xs text-stone-500">요청 시간대</dt>
          <dd className={`font-medium ${hours.confidence === "needs-check" ? "text-amber-700" : "text-stone-800"}`}>
            {hours.confidence === "needs-check" && <span aria-hidden>⚠ </span>}
            {hours.label}
          </dd>
          <dd className="text-xs text-stone-500">
            {age !== null ? `만 ${age}세 이용 가능` : `대상 만 ${meta.ages[0]}~${meta.ages[1]}세`}
          </dd>
        </div>
      </dl>

      {/* 아이사랑 '정보 더보기'처럼 유형·특성·정원/현원·운영시간을 표로 */}
      <div className="overflow-hidden rounded-xl border border-stone-200">
        <dl className="divide-y divide-stone-100 text-sm">
          {facts(match)
            .filter((x) => more || ["kind", "features", "capacity", "hours", "ages"].includes(x.key))
            .map((x) => (
              <div key={x.key} className="grid grid-cols-[6.5rem_1fr] gap-2 px-3 py-2">
                <dt className="text-xs text-stone-500">{x.label}</dt>
                <dd className="text-xs font-medium text-stone-800">{x.value}</dd>
              </div>
            ))}
        </dl>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="block w-full border-t border-stone-100 bg-stone-50 py-1.5 text-center text-xs font-medium text-stone-600"
        >
          {more ? "정보 접기 ▴" : "정보 더보기 ▾"}
        </button>
      </div>

      {(f.staff != null || f.waitlist) && (
        <p className="text-xs text-stone-600">
          {f.staff != null && `교직원 ${f.staff}명`}
          {f.staff != null && f.waitlist && " · "}
          {f.waitlist &&
            (age !== null && age <= 5
              ? `만 ${age}세 입소대기 ${f.waitlist[age]}명`
              : `입소대기 ${f.waitlist.reduce((a, b) => a + b, 0)}명`)}
          {f.asOf && ` (기준일 ${f.asOf})`}
        </p>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        {f.vacancy !== null
          ? `빈자리는 정원과 현원 차이로 계산한 추정치예요(기준일 ${f.asOf || "-"}). 연령별 정원·대기 순번에 따라 실제 입소는 다를 수 있으니 신청 전 시설에 확인해 주세요.`
          : "이 시설은 정원·빈자리 공개 정보가 없어 카카오맵 등록 정보로 위치와 연락처만 보여드려요. 이용 가능 여부와 운영 시간은 시설에 확인해 주세요."}
        {f.kind === "localcenter" && f.vacancy !== null && " 지역아동센터는 이용 대상 기준이 있을 수 있어 시설에 먼저 문의해 주세요."}
      </p>

      <div className="space-y-2">
        {meta.apply ? (
          <a
            href={meta.apply.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700"
          >
            {meta.apply.label} ↗
          </a>
        ) : dial ? (
          <a
            href={`tel:${dial}`}
            className="block rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700"
          >
            전화로 이용 문의하기
          </a>
        ) : null}
        <div className="flex gap-2">
          {dial && meta.apply && (
            <a href={`tel:${dial}`} className={btn}>
              전화
            </a>
          )}
          {f.homepage && (
            <a href={f.homepage} target="_blank" rel="noopener noreferrer" className={btn}>
              홈페이지
            </a>
          )}
          <a
            href={`https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
          >
            길찾기
          </a>
        </div>
        {onAlert && (
          <button onClick={onAlert} className="block w-full rounded-xl border border-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700">
            🔔 이 시설 빈자리 알림 받기
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-stone-700">후기·평판 보기</p>
        <div className="flex gap-2">
          {reviewLinks(f).map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl border border-stone-300 px-2 py-2 text-center text-xs font-medium text-stone-800"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
        <BlogPosts key={f.id} name={f.name} address={f.address} />
        <p className="text-[11px] leading-snug text-stone-400">외부 사이트로 이동해요. 블로그 후기는 개인 의견이며 협찬 글이 섞여 있을 수 있어요.</p>
      </div>

      <Reviews facilityId={f.id} />
    </div>
  );
}
