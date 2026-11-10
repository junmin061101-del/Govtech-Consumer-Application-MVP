"use client";

import { useState } from "react";
import type { Combo } from "@/lib/combos";
import { KIND_META } from "@/lib/kinds";
import { availability } from "@/lib/status";
import type { Facility, Match } from "@/lib/types";
import { chip } from "@/lib/ui";
import type { WidenStep } from "@/lib/widen";
import Reviews from "./Reviews";
import { reviewLinks } from "@/lib/reviewLinks";

const fmtDist = (m: number | null) =>
  m === null ? null : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;

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

function Row({ m, selected, onSelect, showBadge }: { m: Match; selected: boolean; onSelect: (id: string) => void; showBadge: boolean }) {
  const { facility: f, distanceM } = m;
  return (
    <li>
      <button
        onClick={() => onSelect(f.id)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 ${selected ? "bg-emerald-50" : ""}`}
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: KIND_META[f.kind].color }}
        >
          {f.vacancy ?? KIND_META[f.kind].short}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-stone-900">{f.name}</span>
          <span className="block truncate text-xs text-stone-500">
            {KIND_META[f.kind].label}
            {f.kind === "daycare" && f.type ? ` (${f.type})` : ""} · {f.address.replace("서울특별시 ", "")}
          </span>
          {showBadge && (
            <span className="mt-0.5 block">
              <StatusBadge facility={f} />
            </span>
          )}
        </span>
        {fmtDist(distanceM) && <span className="shrink-0 text-xs text-stone-500">{fmtDist(distanceM)}</span>}
      </button>
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
        {full.length > 0 && <FullList full={full} selectedId={selectedId} onSelect={onSelect} />}
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-stone-100">
        {matches.map((m) => (
          <Row key={m.facility.id} m={m} selected={m.facility.id === selectedId} onSelect={onSelect} showBadge={showBadge} />
        ))}
      </ul>
      {full.length > 0 && (
        <div className="border-t border-stone-200 px-4 py-3">
          <button className="text-xs font-medium text-stone-600" onClick={() => setShowFull((v) => !v)}>
            정원이 찬 곳 {full.length}곳 {showFull ? "접기 ▴" : "보기 ▾"} · 빈자리 알림을 받을 수 있어요
          </button>
          {showFull && <FullList full={full} selectedId={selectedId} onSelect={onSelect} />}
        </div>
      )}
    </>
  );
}

function FullList({ full, selectedId, onSelect }: { full: Match[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
      {full.slice(0, 30).map((m) => (
        <Row key={m.facility.id} m={m} selected={m.facility.id === selectedId} onSelect={onSelect} showBadge />
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
}: {
  match: Match;
  age: number | null;
  onClose: () => void;
  /** 이 시설 빈자리 알림 받기. null 이면 숨김 */
  onAlert: (() => void) | null;
}) {
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
        <button onClick={onClose} aria-label="닫기" className="-mr-1 rounded-full p-2 text-stone-500 hover:bg-stone-100">
          ✕
        </button>
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
        <p className="text-[11px] leading-snug text-stone-400">외부 사이트로 이동해요. 블로그 후기는 개인 의견이며 협찬 글이 섞여 있을 수 있어요.</p>
      </div>

      <Reviews facilityId={f.id} />
    </div>
  );
}
