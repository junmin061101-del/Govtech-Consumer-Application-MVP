"use client";

import Link from "next/link";
import { useState } from "react";
import ChildAgesInput, { toMonths, type ChildDraft } from "@/components/ChildAgesInput";
import PageShell, { Card } from "@/components/PageShell";
import PhoneVerify from "@/components/PhoneVerify";
import { useAuth } from "@/components/AuthProvider";
import { DongPicker } from "@/components/RegionPicker";
import { MAX_INTEREST_DONGS } from "@/lib/profile";
import { api, primaryBtn } from "@/lib/ui";

type ConsentKey = "terms" | "privacy" | "age14" | "notify" | "aiLog";

const CONSENTS: { key: ConsentKey; label: React.ReactNode; required: boolean }[] = [
  { key: "age14", label: "만 14세 이상 보호자예요", required: true },
  {
    key: "terms",
    label: (
      <>
        <Link href="/terms" target="_blank" className="underline">
          이용약관
        </Link>
        에 동의해요
      </>
    ),
    required: true,
  },
  {
    key: "privacy",
    label: (
      <>
        <Link href="/privacy" target="_blank" className="underline">
          개인정보 수집·이용
        </Link>
        에 동의해요
      </>
    ),
    required: true,
  },
  { key: "notify", label: "빈자리 알림을 카카오 알림톡으로 받을래요 (휴대폰 인증 후 발송)", required: false },
  {
    key: "aiLog",
    label: (
      <>
        AI 상담 대화 내용 수집·이용에 동의해요 — 서비스 개선과 구청의 돌봄 정책 참고용, 개인정보는 자동으로 가리고 90일 뒤 삭제 (
        <Link href="/privacy" target="_blank" className="underline">
          자세히
        </Link>
        )
      </>
    ),
    required: false,
  },
];

export default function Signup() {
  const { refresh } = useAuth();
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    terms: false,
    privacy: false,
    age14: false,
    notify: false,
    aiLog: false,
  });
  const [children, setChildren] = useState<ChildDraft[]>([{ unit: "years", value: 0 }]);
  const [dongs, setDongs] = useState<string[]>([]);
  const [phoneOk, setPhoneOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const allRequired = consents.terms && consents.privacy && consents.age14;
  // 가입 버튼이 꺼진 이유를 보여 준다
  const blocker = !allRequired
    ? "필수 항목(만 14세 이상·이용약관·개인정보)에 동의해 주세요"
    : dongs.length === 0
      ? "관심 지역(행정동)을 골라 주세요"
      : null;
  const toggleAll = () => {
    const on = !(allRequired && consents.notify && consents.aiLog);
    setConsents({ terms: on, privacy: on, age14: on, notify: on, aiLog: on });
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/signup", {
        method: "POST",
        json: {
          consents,
          children: children.map((c) => ({ months: toMonths(c) })),
          interestDongs: dongs,
          usePhone: phoneOk,
        },
      });
      // onboarded 클레임이 담긴 토큰을 새로 받으면 가입 가드가 지도로 보낸다
      await refresh(true);
    } catch (e) {
      setMsg((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <PageShell title="회원가입" back={null}>
      <Card title="1. 약관 동의">
        <button type="button" onClick={toggleAll} className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-left text-sm font-semibold">
          {allRequired && consents.notify && consents.aiLog ? "☑" : "☐"} 전체 동의 (선택 항목 포함)
        </button>
        <ul className="space-y-2">
          {CONSENTS.map((c) => (
            <li key={c.key}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                  checked={consents[c.key]}
                  onChange={(e) => setConsents((s) => ({ ...s, [c.key]: e.target.checked }))}
                />
                <span>
                  <span className={c.required ? "text-emerald-700" : "text-stone-500"}>[{c.required ? "필수" : "선택"}]</span> {c.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          검색·신청·알림 이용 기록은 <b>누구인지 알 수 없는 통계</b>(행정동·시간대·연령대 단위)로 바뀌어 돌봄 수요 분석에
          쓰여요. 이름·연락처·정확한 위치는 통계에 들어가지 않고, 탈퇴하면 기록과 회원의 연결이 끊어져요.
        </p>
      </Card>

      <Card title="2. 아이 연령">
        <p className="text-xs text-stone-500">이름·생년월일·사진은 받지 않아요. 연령으로 이용 가능한 시설을 골라 드려요.</p>
        <ChildAgesInput value={children} onChange={setChildren} />
      </Card>

      <Card title={`3. 관심 지역 (행정동 1~${MAX_INTEREST_DONGS}개)`}>
        <p className="text-xs text-stone-500">집·직장 근처 동을 고르면 지도와 게시판이 이 동부터 보여요.</p>
        <DongPicker value={dongs} onChange={setDongs} max={MAX_INTEREST_DONGS} />
      </Card>

      <Card title="4. 휴대폰 인증 (선택)">
        <p className="text-xs text-stone-500">
          빈자리 알림톡을 받을 번호예요. 알림 외 용도로 쓰지 않아요. 인증하지 않아도 가입할 수 있고, 그동안 알림은 앱 알림함으로
          받아요. 나중에 내 정보에서 인증할 수 있어요.
        </p>
        <PhoneVerify onVerified={() => setPhoneOk(true)} />
      </Card>

      {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
      {blocker && <p className="text-xs text-amber-700">{blocker}</p>}
      <button
        className={primaryBtn}
        disabled={busy || Boolean(blocker)}
        onClick={submit}
      >
        가입하고 시작하기
      </button>
    </PageShell>
  );
}
