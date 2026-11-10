// 회원 프로필(users/{uid}, 본인만), 연락처(user_contacts/{uid}, 서버만)와 탈퇴 처리.
import { createHmac } from "node:crypto";
import {
  maskPhone,
  nicknameFromSeed,
  PRIVACY_VERSION,
  TERMS_VERSION,
  validateProfileInput,
  type Profile,
  type ProfileInput,
  type ProfileView,
} from "@/lib/profile";
import { deleteAgentLogs } from "./agentLog";
import { PKEY_SALTS } from "./events";
import { HttpError } from "./http";
import { CONTACTS, NOTIFICATIONS } from "./notify";
import { PHONE_VERIFICATIONS, takeVerifiedPhone } from "./phone";
import { isKnownDong } from "./regions";
import { authBackend } from "./auth";
import { nicknameSecret } from "./secrets";
import { store } from "./store";

export const USERS = "users";

/** uid 로부터 늘 같은 익명 닉네임 (uid 를 비밀값으로 해시하므로 닉네임으로 uid 를 알 수 없다) */
export function anonNickname(uid: string): string {
  return nicknameFromSeed(createHmac("sha256", nicknameSecret()).update(`nick:${uid}`).digest());
}

const today = () => new Date().toISOString().slice(0, 10);

export async function getProfile(uid: string): Promise<Profile | null> {
  return store().get<Profile & Record<string, unknown>>(USERS, uid);
}

export async function getProfileView(uid: string): Promise<ProfileView | null> {
  const p = await getProfile(uid);
  if (!p) return null;
  const contact = await store().get<{ phone?: string }>(CONTACTS, uid);
  return { ...p, phone: contact?.phone ? maskPhone(contact.phone) : null };
}

export interface SignupInput extends ProfileInput {
  consents: { terms: boolean; privacy: boolean; age14: boolean; notify: boolean; aiLog?: boolean };
  /** 휴대폰 인증을 마쳤으면 true (번호는 인증 기록에서 꺼낸다) */
  usePhone?: boolean;
}

export async function signup(uid: string, input: SignupInput): Promise<Profile> {
  if (await getProfile(uid)) throw new HttpError(409, "이미 가입했어요");
  const c = input?.consents;
  if (!c?.terms || !c?.privacy) throw new HttpError(400, "필수 약관에 동의해 주세요");
  if (!c.age14) throw new HttpError(400, "만 14세 이상 보호자만 가입할 수 있어요");
  const errors = validateProfileInput(input, isKnownDong);
  if (errors.length) throw new HttpError(400, errors[0]);

  const phone = input.usePhone ? await takeVerifiedPhone(uid) : null;
  if (input.usePhone && !phone) throw new HttpError(400, "휴대폰 인증을 다시 해 주세요");
  // 알림톡 동의는 번호 인증과 따로 기록한다. 인증한 번호가 없으면 알림은 앱 알림함(·푸시)으로 간다 (notify.ts)

  const now = new Date().toISOString();
  const profile: Profile = {
    nickname: anonNickname(uid),
    children: input.children.map((ch) => ({ months: ch.months, asOf: today() })),
    interestDongs: input.interestDongs,
    consents: {
      terms: { agreed: true, version: TERMS_VERSION, at: now },
      privacy: { agreed: true, version: PRIVACY_VERSION, at: now },
      age14: { agreed: true, at: now },
      notify: { agreed: Boolean(c.notify), at: now },
      aiLog: { agreed: Boolean(c.aiLog), version: PRIVACY_VERSION, at: now },
    },
    createdAt: now,
    updatedAt: now,
  };
  await store().set(USERS, uid, profile as unknown as Record<string, unknown>);
  if (phone) await store().set(CONTACTS, uid, { phone, verified_at: now });
  return profile;
}

export interface ProfileUpdate {
  children?: { months: number }[];
  interestDongs?: string[];
  notify?: boolean;
  /** AI 상담 대화 내용 수집 동의 (끄면 저장된 대화 로그도 지운다) */
  aiLog?: boolean;
  /** 새로 인증한 번호로 바꾼다 */
  usePhone?: boolean;
  removePhone?: boolean;
}

export async function updateProfile(uid: string, patch: ProfileUpdate): Promise<Profile> {
  const cur = await getProfile(uid);
  if (!cur) throw new HttpError(404, "회원 정보가 없어요");
  const next: Profile = { ...cur, updatedAt: new Date().toISOString() };

  if (patch.children || patch.interestDongs) {
    const input = {
      children: patch.children ?? cur.children.map((c) => ({ months: c.months })),
      interestDongs: patch.interestDongs ?? cur.interestDongs,
    };
    const errors = validateProfileInput(input, isKnownDong);
    if (errors.length) throw new HttpError(400, errors[0]);
    if (patch.children) next.children = patch.children.map((c) => ({ months: c.months, asOf: today() }));
    if (patch.interestDongs) next.interestDongs = patch.interestDongs;
  }

  if (patch.usePhone) {
    const phone = await takeVerifiedPhone(uid);
    if (!phone) throw new HttpError(400, "휴대폰 인증을 다시 해 주세요");
    await store().set(CONTACTS, uid, { phone, verified_at: next.updatedAt });
  } else if (patch.removePhone) {
    await store().delete(CONTACTS, uid);
    next.consents = { ...next.consents, notify: { agreed: false, at: next.updatedAt } };
  }

  if (typeof patch.notify === "boolean") {
    next.consents = { ...next.consents, notify: { agreed: patch.notify, at: next.updatedAt } };
  }

  if (typeof patch.aiLog === "boolean") {
    next.consents = { ...next.consents, aiLog: { agreed: patch.aiLog, version: PRIVACY_VERSION, at: next.updatedAt } };
    if (!patch.aiLog) await deleteAgentLogs(uid);
  }

  await store().set(USERS, uid, next as unknown as Record<string, unknown>);
  return next;
}

/** 이 회원의 uid 를 담은 문서가 있는 컬렉션과 그 필드. 탈퇴 시 모두 지운다. */
const OWNED: { col: string; field: string }[] = [
  { col: "vacancy_alerts", field: "uid" },
  { col: "alert_deliveries", field: "uid" },
  { col: NOTIFICATIONS, field: "uid" },
  { col: "apply_summaries", field: "uid" },
  { col: "community_posts", field: "uid" },
  // 시설 리뷰 (클라이언트가 Firestore 에 직접 쓰는 컬렉션)
  { col: "reviews", field: "uid" },
];

/**
 * 탈퇴: 개인정보 즉시 삭제.
 * - users, user_contacts, 인증 기록, 알림·신청 요약·게시글을 지운다.
 * - 가명 키 솔트를 지워 demand_events 의 pkey 를 이 회원과 다시 연결할 수 없게 한다(이벤트 자체는 통계로 남는다).
 * - 신고 기록에 남은 uid 는 지운다. 리뷰도 지운다.
 * - 마지막으로 Firebase Auth 계정을 지운다 (Auth 삭제 트리거가 다시 불러도 같은 결과가 되도록 멱등).
 */
export async function withdraw(uid: string): Promise<void> {
  const s = store();
  // 대화 로그는 가명 키로 찾으므로 솔트를 지우기 전에 먼저 지운다
  await deleteAgentLogs(uid);
  await s.delete(USERS, uid);
  await s.delete(CONTACTS, uid);
  await s.delete(PHONE_VERIFICATIONS, uid);
  await s.delete(PKEY_SALTS, uid);
  for (const { col, field } of OWNED) {
    for (const doc of await s.list(col, [[field, "==", uid]])) await s.delete(col, doc.id);
  }
  const reported = await s.list<{ reporters?: string[] }>("community_posts", [["reporters", "array-contains", uid]]);
  for (const p of reported) {
    const { id, ...rest } = p;
    await s.set("community_posts", id, { ...rest, reporters: (rest.reporters ?? []).filter((r) => r !== uid) });
  }
  await authBackend().deleteUser(uid);
}
