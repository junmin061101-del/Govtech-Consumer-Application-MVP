// 휴대폰 번호 인증 (알림톡 수신용). 인증된 번호만 user_contacts 에 저장된다.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "@/lib/profile";
import { isLocal } from "./env";
import { HttpError } from "./http";
import { store } from "./store";

const COL = "phone_verifications";
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Verification {
  phone: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  verified_at: string | null;
  [k: string]: unknown;
}

const hash = (code: string, phone: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");

/**
 * SMS 발송.
 * TODO(질문): SMS 발송 사업자(또는 Firebase 이전 후 Firebase Phone Auth)가 정해지면 연결한다.
 * 지금은 에뮬레이터·테스트에서만 인증번호를 응답·서버 로그로 돌려주고, 실제 프로젝트에서는 발송 불가 오류를 낸다.
 */
async function sendSms(phone: string, text: string): Promise<{ devCode?: string }> {
  if (!isLocal()) {
    throw new HttpError(503, "문자 인증이 아직 준비되지 않았어요");
  }
  console.info(`[careos sms] ${phone.slice(0, 3)}****${phone.slice(-4)}: ${text}`);
  return {};
}

export async function startVerification(uid: string, raw: string): Promise<{ devCode?: string }> {
  const phone = normalizePhone(raw);
  if (!phone) throw new HttpError(400, "휴대폰 번호를 확인해 주세요");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await store().set<Verification>(COL, uid, {
    phone,
    code_hash: hash(code, phone),
    expires_at: Date.now() + CODE_TTL_MS,
    attempts: 0,
    verified_at: null,
  });
  await sendSms(phone, `[CareOS] 인증번호 ${code} (5분 안에 입력해 주세요)`);
  return isLocal() ? { devCode: code } : {};
}

export async function confirmVerification(uid: string, code: string): Promise<void> {
  const v = await store().get<Verification>(COL, uid);
  if (!v || v.expires_at < Date.now()) throw new HttpError(400, "인증번호가 만료됐어요. 다시 받아 주세요");
  if (v.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "시도 횟수를 넘었어요. 인증번호를 다시 받아 주세요");
  const ok =
    /^\d{6}$/.test(code) && timingSafeEqual(Buffer.from(hash(code, v.phone)), Buffer.from(v.code_hash));
  if (!ok) {
    await store().set(COL, uid, { ...v, attempts: v.attempts + 1 });
    throw new HttpError(400, "인증번호가 맞지 않아요");
  }
  await store().set(COL, uid, { ...v, verified_at: new Date().toISOString() });
}

/** 인증을 마친 번호를 꺼내고 인증 기록은 지운다. 없으면 null */
export async function takeVerifiedPhone(uid: string): Promise<string | null> {
  const v = await store().get<Verification>(COL, uid);
  if (!v?.verified_at) return null;
  await store().delete(COL, uid);
  return v.phone;
}

export const PHONE_VERIFICATIONS = COL;
