// 네이버 메일 보내기 (SMTP). 부모가 입력한 네이버 아이디·앱 비밀번호로 그 한 번만 보낸다.
// 앱 비밀번호는 저장·기록하지 않고(요청 처리 중 메모리에서만), 메일 본문도 저장하지 않는다.
// 네이버 메일 설정에서 'POP3/SMTP 사용'을 켜고, 2단계 인증 사용 시 '애플리케이션 비밀번호'를 만들어 써야 한다.
import nodemailer from "nodemailer";
import { HttpError } from "./http";

export interface MailInput {
  naverId: string;
  appPassword: string;
  to: string;
  subject: string;
  body: string;
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const MAX_BODY = 5000;

/** 입력 검증. 통과하면 정리된 값을 돌려준다 */
export function validateMail(input: Partial<MailInput>): MailInput {
  const naverId = String(input.naverId ?? "")
    .trim()
    .replace(/@naver\.com$/i, "");
  const appPassword = String(input.appPassword ?? "");
  const to = String(input.to ?? "").trim();
  const subject = String(input.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  const body = String(input.body ?? "").trim();
  if (!/^[a-z0-9._-]{3,30}$/i.test(naverId)) throw new HttpError(400, "네이버 아이디를 확인해 주세요");
  if (appPassword.length < 4 || appPassword.length > 64) throw new HttpError(400, "앱 비밀번호를 확인해 주세요");
  if (!EMAIL.test(to)) throw new HttpError(400, "받는 사람 이메일 주소를 확인해 주세요");
  if (!subject || subject.length > 200) throw new HttpError(400, "제목을 1~200자로 적어 주세요");
  if (!body || body.length > MAX_BODY) throw new HttpError(400, `본문을 1~${MAX_BODY}자로 적어 주세요`);
  if (/\[아이 이름\]|\[보호자 이름\]|\[연락처\]/.test(subject + body)) throw new HttpError(400, "[아이 이름] 같은 빈칸을 채운 뒤 보내 주세요");
  return { naverId, appPassword, to, subject, body };
}

type Transport = { sendMail(m: Record<string, unknown>): Promise<{ messageId?: string }> };
let makeTransport = (user: string, pass: string): Transport =>
  nodemailer.createTransport({ host: "smtp.naver.com", port: 465, secure: true, auth: { user, pass }, connectionTimeout: 15_000 });

export function setTransportForTests(f: ((user: string, pass: string) => Transport) | null) {
  makeTransport = f ?? ((user, pass) => nodemailer.createTransport({ host: "smtp.naver.com", port: 465, secure: true, auth: { user, pass } }));
}

export async function sendNaverMail(raw: Partial<MailInput>): Promise<{ ok: true }> {
  const m = validateMail(raw);
  const from = `${m.naverId}@naver.com`;
  try {
    await makeTransport(m.naverId, m.appPassword).sendMail({ from, to: m.to, replyTo: from, subject: m.subject, text: m.body });
  } catch (e) {
    const code = (e as { responseCode?: number; code?: string })?.responseCode;
    // 오류 내용에 비밀번호가 섞이지 않도록 코드만 남긴다
    console.error("naver smtp failed", code ?? (e as { code?: string })?.code ?? "unknown");
    if (code === 535 || (e as { code?: string })?.code === "EAUTH") {
      throw new HttpError(400, "네이버 로그인에 실패했어요. 앱 비밀번호와 'POP3/SMTP 사용' 설정을 확인해 주세요");
    }
    throw new HttpError(502, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요");
  }
  return { ok: true };
}
