"use client";

import { KIND_META } from "@/lib/kinds";
import type { Match } from "@/lib/types";

const fmtDist = (m: number | null) =>
  m === null ? null : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;

export function ResultList({
  matches,
  selectedId,
  onSelect,
}: {
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-stone-600">
        <p className="font-semibold text-stone-800">조건에 맞는 곳이 없어요</p>
        <p className="mt-1">나이·시간·이동 범위를 조금 넓혀 보세요. 야간·주말은 운영 정보가 확인된 시설만 보여요.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-stone-100">
      {matches.map(({ facility: f, distanceM }) => (
        <li key={f.id}>
          <button
            onClick={() => onSelect(f.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 ${
              f.id === selectedId ? "bg-emerald-50" : ""
            }`}
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
            </span>
            {fmtDist(distanceM) && <span className="shrink-0 text-xs text-stone-500">{fmtDist(distanceM)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FacilityDetail({
  match,
  age,
  onClose,
}: {
  match: Match;
  age: number | null;
  onClose: () => void;
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

      <p className="text-xs leading-relaxed text-stone-500">
        {f.vacancy !== null
          ? `빈자리는 정원과 현원 차이로 계산한 추정치예요(기준일 ${f.asOf || "-"}). 연령별 정원·대기 순번에 따라 실제 입소는 다를 수 있으니 신청 전 시설에 확인해 주세요.`
          : "이 시설은 정원·빈자리 공개 정보가 없어 카카오맵 등록 정보로 위치와 연락처만 보여드려요. 이용 가능 여부와 운영 시간은 시설에 확인해 주세요."}
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
          {f.detailUrl && (
            <a href={f.detailUrl} target="_blank" rel="noopener noreferrer" className={btn}>
              카카오맵
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
      </div>
    </div>
  );
}
