// 요청 인증: Authorization: Bearer <Firebase ID 토큰>. 가입 완료 여부는 커스텀 클레임 onboarded.
// Admin SDK 호출은 AuthBackend 뒤에 두어 테스트에서 가짜 백엔드로 바꿔 끼운다.
import { adminAuth } from "@/lib/firebaseAdmin";

export interface Session {
  uid: string;
  /** 가입(프로필 작성)을 마쳤는지 */
  onboarded: boolean;
  /** 로그인 이메일 (관리자 확인용). 저장하지 않는다 */
  email?: string;
}

export interface AuthBackend {
  verify(idToken: string): Promise<Session>;
  /** 개발용 로그인(에뮬레이터 전용): 사용자 레코드를 보장하고 클레임을 맞춘 뒤 커스텀 토큰을 만든다 */
  customToken(uid: string, claims: { nickname: string; onboarded: boolean }): Promise<string>;
  setOnboarded(uid: string, nickname: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

const firebaseBackend: AuthBackend = {
  async verify(idToken) {
    const d = await adminAuth().verifyIdToken(idToken);
    return { uid: d.uid, onboarded: d.onboarded === true, email: d.email_verified ? d.email : undefined };
  },
  async customToken(uid, claims) {
    const auth = adminAuth();
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({ uid });
    }
    // 커스텀 토큰 클레임은 그 로그인에만 붙으므로, 토큰 갱신 후에도 남도록 사용자 클레임으로 저장한다
    await auth.setCustomUserClaims(uid, { ...(await auth.getUser(uid)).customClaims, ...claims });
    return auth.createCustomToken(uid);
  },
  async setOnboarded(uid, nickname) {
    // 기존 클레임(구청 대시보드의 role·sigungu_code 등)을 지우지 않도록 합쳐서 저장한다
    const auth = adminAuth();
    const prev = (await auth.getUser(uid)).customClaims ?? {};
    await auth.setCustomUserClaims(uid, { ...prev, nickname, onboarded: true });
  },
  async deleteUser(uid) {
    await adminAuth()
      .deleteUser(uid)
      .catch((e: { code?: string }) => {
        if (e?.code !== "auth/user-not-found") throw e;
      });
  },
};

let backend: AuthBackend = firebaseBackend;

export const authBackend = () => backend;

/** 테스트: 토큰 "test:<uid>" 를 받아들이고 가입 여부를 메모리에 둔다 */
export function useTestAuth() {
  const onboarded = new Set<string>();
  backend = {
    async verify(token) {
      const m = token.match(/^test:(.+)$/);
      if (!m) throw new Error("bad token");
      return { uid: m[1], onboarded: onboarded.has(m[1]) };
    },
    async customToken(uid, claims) {
      if (claims.onboarded) onboarded.add(uid);
      return `test:${uid}`;
    },
    async setOnboarded(uid) {
      onboarded.add(uid);
    },
    async deleteUser(uid) {
      onboarded.delete(uid);
    },
  };
  return { markOnboarded: (uid: string) => onboarded.add(uid) };
}

export async function sessionFrom(req: Request): Promise<Session | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  try {
    return await backend.verify(token);
  } catch {
    return null;
  }
}
