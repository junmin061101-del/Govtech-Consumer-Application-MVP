"use client";

// 시설 비교 (최대 3곳). 아이사랑 '비교하기'처럼 항목별로 나란히 보고, 가장 나은 값(빈자리 최다·가장 가까움·대기 최소)을 표시한다.
import { bestIds, facts } from "@/lib/facilityFacts";
import { KIND_META } from "@/lib/kinds";
import type { Match } from "@/lib/types";

export default function CompareSheet({
  items,
  onRemove,
  onOpen,
  onClose,
}: {
  items: Match[];
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const rows = items.map(facts);
  const best = bestIds(items);
  const keys = rows[0]?.map((r) => ({ key: r.key, label: r.label })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="시설 비교"
        className="max-h-[88vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-base font-bold">시설 비교 ({items.length})</h2>
          <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-stone-500 hover:bg-stone-100">
            ✕
          </button>
        </div>
        <div className="max-h-[calc(88vh-3.5rem)] overflow-auto">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th className="w-24 border-b border-stone-200 bg-stone-50 p-2 text-left text-xs font-medium text-stone-500">항목</th>
                {items.map((m) => (
                  <th key={m.facility.id} className="border-b border-l border-stone-200 p-2 text-left align-top">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: KIND_META[m.facility.kind].color }}>
                      {KIND_META[m.facility.kind].label}
                    </span>
                    <button onClick={() => onOpen(m.facility.id)} className="mt-1 block text-left text-sm font-bold leading-tight text-stone-900 hover:underline">
                      {m.facility.name}
                    </button>
                    <button onClick={() => onRemove(m.facility.id)} className="mt-1 text-[11px] text-stone-400 underline">
                      빼기
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.key} className={i % 2 ? "bg-stone-50/60" : ""}>
                  <th className="border-b border-stone-100 bg-stone-50 p-2 text-left text-xs font-medium text-stone-500">{k.label}</th>
                  {items.map((m, j) => {
                    const isBest = best[k.key] === m.facility.id;
                    return (
                      <td
                        key={m.facility.id}
                        className={`border-b border-l border-stone-100 p-2 align-top text-xs leading-snug ${
                          isBest ? "bg-emerald-50 font-semibold text-emerald-800" : "text-stone-800"
                        }`}
                      >
                        {rows[j][i].value}
                        {isBest && <span className="ml-1 text-[10px]">★</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-[11px] leading-snug text-stone-400">
            ★ 빈자리 가장 많음·가장 가까움·대기 가장 적음. 빈자리는 공개자료의 정원−현원 추정치라 연령별 정원·대기 순번에 따라 실제와
            다를 수 있어요. 신청 전 시설에 꼭 확인해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
