import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { redirectUri, siteOrigin, STATE_COOKIE } from "@/lib/kakaoAuth";

const fail = (req: Request, reason: string) =>
  NextResponse.redirect(`${siteOrigin(req)}/auth/done#error=${encodeURIComponent(reason)}`);

// 카카오 인가 코드 → 카카오 사용자 확인 → Firebase 커스텀 토큰 발급.
// 토큰은 쿼리가 아닌 URL fragment 로 넘겨 서버 로그·Referer 에 남지 않게 한다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];

  if (url.searchParams.get("error")) return fail(req, "로그인을 취소했어요");
  if (!code || !state || state !== cookieState) return fail(req, "로그인 요청이 올바르지 않아요. 다시 시도해 주세요");

  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) return fail(req, "서버 설정이 아직 끝나지 않았어요");

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri(req),
      code,
    });
    if (process.env.KAKAO_CLIENT_SECRET) tokenBody.set("client_secret", process.env.KAKAO_CLIENT_SECRET);

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: tokenBody,
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error(token.error_description ?? "토큰 발급 실패");

    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) throw new Error("카카오 사용자 정보를 가져오지 못했어요");

    const nickname: string = String(
      me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? "학부모",
    ).slice(0, 20);

    // nickname 을 토큰 claim 에 넣어 두면 Firestore 규칙이 '본인 닉네임'인지 서버 값으로 검증할 수 있다.
    const firebaseToken = await adminAuth().createCustomToken(`kakao:${me.id}`, { nickname });

    const res = NextResponse.redirect(`${siteOrigin(req)}/auth/done#token=${encodeURIComponent(firebaseToken)}`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/kakao" });
    return res;
  } catch (e) {
    console.error("kakao login failed", e);
    return fail(req, "로그인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }
}
