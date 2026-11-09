import { useTestAuth } from "@/lib/server/auth";
import { resetStoreForTests } from "@/lib/server/store";

let auth = useTestAuth();

/** 빈 메모리 저장소 + 테스트용 인증 (토큰 "test:<uid>") */
export const fresh = () => {
  resetStoreForTests();
  auth = useTestAuth();
};

/** Authorization 헤더를 붙인 요청. uid 를 주면 기본으로 가입을 마친 회원으로 본다 */
export function req(url: string, opts: { uid?: string; onboarded?: boolean; method?: string; json?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = {};
  const token = opts.token ?? (opts.uid ? `test:${opts.uid}` : "");
  if (opts.uid && opts.onboarded !== false) auth.markOnboarded(opts.uid);
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, {
    method: opts.method ?? (opts.json !== undefined ? "POST" : "GET"),
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });

// 테스트용 좌표·행정동 (서울 경계 데이터에서 확인한 값)
export const NORYANGJIN = { lat: 37.5131, lng: 126.9426 };
