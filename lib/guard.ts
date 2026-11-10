// 회원가입 필수 가드 (정적 호스팅이라 서버 리디렉션 대신 클라이언트에서 판단한다).
// API 는 요청마다 따로 권한을 확인하므로, 이 가드는 화면 이동만 맡는다.

export const PUBLIC_PATHS = ["/login", "/terms", "/privacy"];

const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/** 이동해야 할 주소. 그대로 두면 null */
export function guardRedirect(path: string, state: { signedIn: boolean; onboarded: boolean }, search = ""): string | null {
  const p = path.replace(/\/$/, "") || "/";
  if (!state.signedIn) {
    if (isPublic(p)) return null;
    return p === "/" ? "/login" : `/login?next=${encodeURIComponent(p + search)}`;
  }
  // 로그인 화면에서 로그인·가입에 성공하면 다음 단계로 보낸다
  if (p === "/login") return state.onboarded ? "/" : "/signup";
  if (!state.onboarded && p !== "/signup" && !isPublic(p)) return "/signup";
  if (state.onboarded && p === "/signup") return "/";
  return null;
}
