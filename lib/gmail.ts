// Gmail 로 보내기: 브라우저에서 Google 로그인 창으로 '메일 보내기' 권한(gmail.send)만 받아 바로 Gmail API 로 보낸다.
// 토큰은 이 한 번만 쓰고 저장하지 않으며, CareOS 서버를 거치지 않는다. 받은편지함을 읽는 권한은 요청하지 않는다.
// 필요: NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID (Google Cloud 콘솔 > 사용자 인증 정보 > OAuth 클라이언트 ID, 웹 애플리케이션)

/* eslint-disable @typescript-eslint/no-explicit-any */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const gmailClientId = () => process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim() || "";

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RFC 2822 메시지 (UTF-8 제목·본문). 헤더 주입을 막기 위해 줄바꿈을 지운다 */
export function buildRawMessage(m: { to: string; subject: string; body: string }): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const lines = [
    `To: ${clean(m.to)}`,
    `Subject: =?UTF-8?B?${b64(clean(m.subject))}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.body.replace(/\r?\n/g, "\r\n")),
  ];
  return b64url(lines.join("\r\n"));
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Google 로그인을 불러오지 못했어요"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Google 로그인 창을 띄워 gmail.send 토큰을 받는다 (버튼 클릭 안에서 불러야 팝업이 막히지 않는다) */
async function getToken(clientId: string): Promise<string> {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (r: any) => (r?.access_token ? resolve(r.access_token) : reject(new Error("Gmail 권한을 받지 못했어요"))),
      error_callback: (e: any) => reject(new Error(e?.type === "popup_closed" ? "Google 로그인 창을 닫았어요" : "Gmail 권한을 받지 못했어요")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function sendWithGmail(m: { to: string; subject: string; body: string }): Promise<void> {
  const clientId = gmailClientId();
  if (!clientId) throw new Error("Gmail 연결이 아직 준비되지 않았어요");
  const token = await getToken(clientId);
  try {
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: buildRawMessage(m) }),
    });
    if (!r.ok) throw new Error(r.status === 403 ? "Gmail 보내기 권한이 없어요 (테스트 사용자 등록이 필요할 수 있어요)" : "Gmail 로 보내지 못했어요");
  } finally {
    // 받은 토큰은 바로 폐기한다
    (window as any).google?.accounts?.oauth2?.revoke?.(token, () => {});
  }
}

/** 메일 앱 열기 (연동 없이) */
export const mailtoUrl = (m: { to: string; subject: string; body: string }) =>
  `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
