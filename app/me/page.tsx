"use client";

import { signOut as fbSignOut } from "firebase/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import ChildAgesInput, { fromMonths, toMonths, type ChildDraft } from "@/components/ChildAgesInput";
import PageShell, { Card } from "@/components/PageShell";
import InstallApp from "@/components/InstallApp";
import PhoneVerify from "@/components/PhoneVerify";
import { DongPicker, useRegions } from "@/components/RegionPicker";
import { ageText, currentMonths, MAX_INTEREST_DONGS } from "@/lib/profile";
import { auth } from "@/lib/firebase";
import { dongLabel } from "@/lib/regions";
import { api, primaryBtn, secondaryBtn } from "@/lib/ui";

interface Alert {
  id: string;
  target:
    | { type: "facility"; facilityName: string }
    | { type: "condition"; emdCode: string; day: string; start: string; end: string; age: number | null };
  expires_at: string;
}

interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  actions?: { id: string; label: string }[];
  answered: string | null;
  read_at: string | null;
  created_at: string;
  link?: string;
}

const DAY: Record<string, string> = { weekday: "평일", sat: "토요일", sun: "일요일" };
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export default function Me() {
  const { user, profile, flags, refresh, signOut, loading } = useAuth();
  const regions = useRegions();

  if (loading || !profile) return <PageShell title="내 정보" back={null}>불러오는 중…</PageShell>;

  return (
    <PageShell title="내 정보" back={null}>
      <Card>
        <p className="text-sm text-stone-500">게시판에서 보이는 이름</p>
        <p className="text-lg font-bold">{profile.nickname}</p>
        <p className="text-xs text-stone-500">실명·카카오 닉네임은 쓰지 않아요. 닉네임은 자동으로 만들어져요.</p>
      </Card>

      <ProfileForm key={profile.updatedAt} onSaved={refresh} />

      {flags.vacancy && <Alerts regionsLabel={(c) => dongLabel(regions, c)} />}
      <Inbox />

      <Card title="앱처럼 쓰기">
        <InstallApp />
      </Card>

      <Card title="약관·동의">
        <ul className="space-y-1 text-sm text-stone-700">
          <li>
            이용약관 동의 ({profile.consents.terms.version}) ·{" "}
            <Link href="/terms" className="underline">
              보기
            </Link>
          </li>
          <li>
            개인정보 수집·이용 동의 ({profile.consents.privacy.version}) ·{" "}
            <Link href="/privacy" className="underline">
              보기
            </Link>
          </li>
          <li>알림톡 수신: {profile.consents.notify.agreed ? "동의" : "미동의"}</li>
          <li>AI 상담 대화 내용 수집: {profile.consents.aiLog?.agreed ? "동의" : "미동의"}</li>
        </ul>
      </Card>

      <div className="flex gap-2">
        <button className={`${secondaryBtn} flex-1`} onClick={signOut}>
          로그아웃
        </button>
        {user?.isAdmin && (
          <Link href="/admin/community" className={`${secondaryBtn} flex-1`}>
            게시판 관리
          </Link>
        )}
      </div>
      <Withdraw />
    </PageShell>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const { profile } = useAuth();
  const p = profile!;
  const [children, setChildren] = useState<ChildDraft[]>(p.children.map((c) => fromMonths(currentMonths(c))));
  const [dongs, setDongs] = useState<string[]>(p.interestDongs);
  const [notify, setNotify] = useState(p.consents.notify.agreed);
  const [aiLog, setAiLog] = useState(Boolean(p.consents.aiLog?.agreed));
  const [newPhone, setNewPhone] = useState(false);
  const [changingPhone, setChangingPhone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/me", {
        method: "PUT",
        json: { children: children.map((c) => ({ months: toMonths(c) })), interestDongs: dongs, usePhone: newPhone, notify, aiLog },
      });
      await onSaved();
      setMsg("저장했어요");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removePhone = async () => {
    if (!confirm("인증한 휴대폰 번호를 지울까요? 알림톡 수신도 함께 꺼져요.")) return;
    try {
      await api("/api/me", { method: "PUT", json: { removePhone: true } });
      await onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Card title="프로필 설정">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-stone-600">아이 연령</p>
        <p className="text-xs text-stone-500">
          지금: {p.children.map((c) => ageText(currentMonths(c))).join(", ")} · 지도 검색에 첫째 나이가 자동으로 채워져요
        </p>
        <ChildAgesInput value={children} onChange={setChildren} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-stone-600">관심 지역 (1~{MAX_INTEREST_DONGS}개)</p>
        <DongPicker value={dongs} onChange={setDongs} max={MAX_INTEREST_DONGS} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-stone-600">휴대폰 번호 (알림톡용)</p>
        {p.phone && !changingPhone ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1">{p.phone}</span>
            <button className={secondaryBtn} onClick={() => setChangingPhone(true)}>
              변경
            </button>
            <button className={secondaryBtn} onClick={removePhone}>
              삭제
            </button>
          </div>
        ) : (
          <PhoneVerify onVerified={() => setNewPhone(true)} />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          빈자리 알림을 알림톡으로 받기 (선택)
        </label>
        <p className="text-xs text-stone-500">동의하지 않았거나 인증한 번호가 없으면 앱 알림함으로 받아요.</p>
      </div>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={aiLog} onChange={(e) => setAiLog(e.target.checked)} />
          AI 상담 대화 내용 수집·이용 동의 (선택)
        </label>
        <p className="text-xs leading-relaxed text-stone-500">
          동의하면 AI 상담의 질문·답변이 개인정보(전화번호·이름·상세 주소 등)를 자동으로 가린 뒤 90일 동안 보관되고, 서비스 개선과
          관할 구청의 돌봄 정책 참고에 쓰여요. 동의를 끄면 지금까지 저장된 대화도 바로 지워요. 동의하지 않아도 AI 상담은 그대로
          쓸 수 있고, 이때는 누구인지 알 수 없는 통계(동네·시간대·주제)만 남아요.
        </p>
      </div>
      {msg && <p className="text-xs text-stone-600" role="status">{msg}</p>}
      <button className={primaryBtn} disabled={busy} onClick={save}>
        저장
      </button>
    </Card>
  );
}

function Alerts({ regionsLabel }: { regionsLabel: (code: string) => string }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [max, setMax] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ alerts: Alert[]; max: number }>("/api/alerts")
      .then((r) => {
        setAlerts(r.alerts);
        setMax(r.max);
      })
      .catch((e) => setMsg(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (id: string, method: "DELETE" | "PATCH") => {
    try {
      await api(`/api/alerts/${id}`, { method });
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Card title={`빈자리 알림 (${alerts?.length ?? 0}/${max})`} id="alerts">
      {!alerts ? (
        <p className="text-xs text-stone-500">불러오는 중…</p>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-stone-500">받고 있는 알림이 없어요. 시설 카드나 결과 없음 화면에서 등록할 수 있어요.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const left = daysLeft(a.expires_at);
            return (
              <li key={a.id} className="rounded-xl bg-stone-50 p-3 text-sm">
                <p className="font-medium">
                  {a.target.type === "facility"
                    ? a.target.facilityName
                    : `${regionsLabel(a.target.emdCode)} · ${DAY[a.target.day]} ${a.target.start}~${a.target.end}${
                        a.target.age !== null ? ` · 만 ${a.target.age}세` : ""
                      }`}
                </p>
                <p className={`text-xs ${left <= 7 ? "text-amber-700" : "text-stone-500"}`}>{left}일 남음</p>
                <div className="mt-2 flex gap-2">
                  <button className={secondaryBtn} onClick={() => act(a.id, "PATCH")}>
                    90일 연장
                  </button>
                  <button className={secondaryBtn} onClick={() => act(a.id, "DELETE")}>
                    해지
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </Card>
  );
}

function Inbox() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const load = useCallback(() => {
    api<{ notifications: Notice[] }>("/api/notifications")
      .then((r) => setItems(r.notifications))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const answer = async (id: string, response: string) => {
    await api(`/api/notifications/${id}`, { method: "POST", json: { response } }).catch(() => {});
    load();
  };

  return (
    <Card title="알림함" id="inbox">
      {!items ? (
        <p className="text-xs text-stone-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-stone-500">아직 받은 알림이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-semibold">{n.title}</p>
              <p className="mt-0.5 text-stone-700">{n.body}</p>
              <p className="mt-1 text-xs text-stone-400">{new Date(n.created_at).toLocaleString("ko-KR")}</p>
              {n.actions && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.answered ? (
                    <span className="text-xs text-emerald-700">
                      응답: {n.actions.find((a) => a.id === n.answered)?.label}
                    </span>
                  ) : (
                    n.actions.map((a) => (
                      <button key={a.id} className={secondaryBtn} onClick={() => answer(n.id, a.id)}>
                        {a.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Withdraw() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const withdraw = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE" });
      // 서버가 Auth 계정까지 지웠으니 이 브라우저의 로그인 상태도 비운다
      await fbSignOut(auth()).catch(() => {});
      window.location.href = "/login";
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="pb-8 text-center">
      {!open ? (
        <button className="text-xs text-stone-400 underline" onClick={() => setOpen(true)}>
          회원 탈퇴
        </button>
      ) : (
        <Card title="정말 탈퇴할까요?">
          <p className="text-left text-sm leading-relaxed text-stone-700">
            프로필·휴대폰 번호·빈자리 알림·알림함·신청 요약·내 게시글이 <b>바로 삭제</b>되고 되돌릴 수 없어요. 통계 기록은
            회원과의 연결이 끊긴 상태로만 남아요.
          </p>
          <div className="flex gap-2">
            <button className={`${secondaryBtn} flex-1`} onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={withdraw}>
              탈퇴하기
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
