import { NextResponse } from "next/server";
import { redirectUri, STATE_COOKIE } from "@/lib/kakaoAuth";

// 카카오 로그인 화면으로 보낸다. state 는 CSRF 방지용 일회성 값.
export async function GET(req: Request) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) {
    return NextResponse.json({ error: "KAKAO_REST_API_KEY 가 설정되지 않았습니다" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "profile_nickname",
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/auth/kakao",
  });
  return res;
}
