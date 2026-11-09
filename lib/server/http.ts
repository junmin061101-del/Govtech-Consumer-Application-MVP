// API 공통: 오류 응답, 권한 확인, 기능 플래그, 요청 제한.
// Next 런타임 없이 Cloud Functions 에서도 돌도록 표준 Request/Response 만 쓴다.
import type { FlagName } from "@/lib/flags";
import { sessionFrom, type Session } from "./auth";
import { isLocal } from "./env";
import { readServerFlags } from "./flags";
import { store } from "./store";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);

export const flags = () => readServerFlags();

/** 가입까지 마친 회원만. 아니면 401/403 */
export async function requireMember(req: Request): Promise<Session> {
  const s = await sessionFrom(req);
  if (!s) throw new HttpError(401, "로그인이 필요해요");
  if (!s.onboarded) throw new HttpError(403, "회원가입을 먼저 마쳐 주세요");
  return s;
}

/** 로그인만 확인 (가입 중 화면용) */
export async function requireLogin(req: Request): Promise<Session> {
  const s = await sessionFrom(req);
  if (!s) throw new HttpError(401, "로그인이 필요해요");
  return s;
}

export async function requireFlag(name: FlagName) {
  if (!(await flags())[name]) throw new HttpError(404, "아직 열리지 않은 기능이에요");
}

/** 관리자: ADMIN_UIDS(uid) 또는 ADMIN_EMAILS(확인을 마친 이메일) 에 있는 계정 */
export function isAdmin(uid: string, email?: string): boolean {
  const list = (name: string) => (process.env[name] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list("ADMIN_UIDS").includes(uid.toLowerCase())) return true;
  if (email && list("ADMIN_EMAILS").includes(email.toLowerCase())) return true;
  // 에뮬레이터·테스트에서는 개발용 로그인 'admin' 계정을 관리자로 둔다
  return isLocal() && uid === "dev:admin";
}

export { isLocal };

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "요청 형식이 올바르지 않아요");
  }
}

/** 라우트 본문을 감싸 HttpError 를 JSON 응답으로 바꾼다 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
    console.error(e);
    return json({ error: "잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}

// --- 요청 제한: 고정 창 카운터를 저장소에 둬서 Functions 인스턴스끼리 공유한다 ---
// Firestore 의 rate_limits 컬렉션에는 expires_at TTL 정책을 걸어 오래된 카운터를 자동 삭제한다.
export const RATE_LIMITS = "rate_limits";

export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const id = `${key}:${windowStart}`.replace(/\//g, "_");
  const n = await store().increment(RATE_LIMITS, id, "n", 1, { expires_at: new Date(windowStart + windowMs * 2) });
  if (n > limit) throw new HttpError(429, "요청이 너무 많아요. 잠시 후 다시 시도해 주세요");
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
