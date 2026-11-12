"use client";

// 아이사랑 '같이 하기' 카드: 메뉴 바로가기(새 탭) + 단계 체크리스트 + 상담 창 작게 띄우기 + 막히면 화면 캡처 보내기.
// 로그인·간편인증·신청 버튼은 부모가 아이사랑에서 직접 누른다.
import { useEffect, useState } from "react";
import { isarangGuide } from "@/lib/isarang";

export const OPEN_PIP_EVENT = "careos-open-pip";

export default function IsarangGuideCard({ task, facility, onCapture }: { task: string; facility: string | null; onCapture: () => void }) {
  const g = isarangGuide(task, facility);
  const [done, setDone] = useState<boolean[]>([]);
  const [canPip, setCanPip] = useState(false);
  useEffect(() => setCanPip(Boolean((window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture)), []);
  if (!g) return null;

  return (
    <div className="max-w-[92%] space-y-2.5 rounded-2xl border border-emerald-200 bg-white px-3.5 py-3 shadow-sm">
      <p className="text-xs font-semibold text-emerald-800">🧭 아이사랑 같이 하기 · {g.title}</p>
      <div className="flex flex-wrap gap-1.5">
        {g.links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-emerald-600 px-3 py-1 text-xs font-medium text-emerald-700"
          >
            {l.label} ↗
          </a>
        ))}
      </div>
      <ol className="space-y-1">
        {g.steps.map((s, i) => (
          <li key={s}>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-stone-700">
              <input
                type="checkbox"
                className="mt-0.5 accent-emerald-600"
                checked={Boolean(done[i])}
                onChange={(e) => setDone((d) => Object.assign([...d], { [i]: e.target.checked }))}
              />
              <span className={done[i] ? "text-stone-400 line-through" : ""}>
                {i + 1}. {s}
              </span>
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {canPip && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PIP_EVENT))}
            className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700"
            title="아이사랑을 보면서도 이 상담 창이 항상 위에 떠 있어요"
          >
            🪟 상담 창 작게 띄우기
          </button>
        )}
        <button type="button" onClick={onCapture} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700">
          📷 막히면 화면 보내기
        </button>
      </div>
      <p className="text-[11px] leading-snug text-stone-400">
        로그인·간편인증·신청은 아이사랑에서 직접 해 주세요. CareOS 는 아이디·비밀번호를 받지 않아요. 메뉴 이름은 아이사랑 사정에 따라 바뀔
        수 있어요. 막히면 헬프데스크 {g.helpdesk}.
      </p>
    </div>
  );
}
