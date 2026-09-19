/** 카카오 로그인 콜백 주소. 프록시(Vercel·Codespaces) 뒤에서도 실제 접속 주소를 쓴다. */
export function siteOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const redirectUri = (req: Request) => `${siteOrigin(req)}/api/auth/kakao/callback`;

export const STATE_COOKIE = "careos_kakao_state";
