// Cloud Functions 2세대 (asia-northeast3). Hosting 이 /api/** 를 api 함수로 넘긴다(firebase.json).
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as v1 from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { adminAppCheck } from "@/lib/firebaseAdmin";
import { runDaily } from "@/lib/server/daily";
import { withdraw } from "@/lib/server/users";
import { APP_CHECK_EXEMPT, dispatch } from "./router";

const REGION = "asia-northeast3";
setGlobalOptions({ region: REGION });

// Secret Manager 의 비밀값. 쓰지 않는 값은 "-" 로 만들어 두면 없는 것으로 본다.
const S = {
  PKEY_SECRET: defineSecret("PKEY_SECRET"),
  NICKNAME_SECRET: defineSecret("NICKNAME_SECRET"),
  SEOUL_OPEN_API_KEY: defineSecret("SEOUL_OPEN_API_KEY"),
  DATA_GO_KR_SERVICE_KEY: defineSecret("DATA_GO_KR_SERVICE_KEY"),
  // 유치원 주소 → 좌표 (카카오 로컬 API, REST 키)
  KAKAO_REST_API_KEY: defineSecret("KAKAO_REST_API_KEY"),
  // 시설 블로그 후기 (NAVER API HUB 검색, 네이버 클라우드 플랫폼 Application 인증 정보)
  NAVER_API_HUB_CLIENT_ID: defineSecret("NAVER_API_HUB_CLIENT_ID"),
  NAVER_API_HUB_CLIENT_SECRET: defineSecret("NAVER_API_HUB_CLIENT_SECRET"),
};
const ALL = Object.values(S);

function dropPlaceholders() {
  for (const name of Object.keys(S)) if (process.env[name]?.trim() === "-") delete process.env[name];
}

/** express 요청 → 표준 Request */
function toRequest(req: v1.https.Request): Request {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, String(v));
  }
  const hasBody = !["GET", "HEAD"].includes(req.method) && req.rawBody?.length;
  return new Request(`${proto}://${host}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: hasBody ? new Uint8Array(req.rawBody) : undefined,
  });
}

export const api = onRequest(
  { secrets: ALL, maxInstances: 20, concurrency: 80, memory: "512MiB", timeoutSeconds: 60, invoker: "public" },
  async (req, res) => {
    dropPlaceholders();
    // App Check: 운영(APP_CHECK_ENFORCE=true)에서는 토큰이 없거나 틀리면 거절한다
    if (process.env.APP_CHECK_ENFORCE === "true" && !APP_CHECK_EXEMPT.includes(req.path)) {
      const token = req.get("x-firebase-appcheck");
      try {
        if (!token) throw new Error("missing");
        await adminAppCheck().verifyToken(token);
      } catch {
        res.status(401).json({ error: "앱 확인에 실패했어요. 새로고침 후 다시 시도해 주세요" });
        return;
      }
    }
    const out = await dispatch(toRequest(req));
    res.status(out.status);
    out.headers.forEach((v, k) => {
      if (k !== "set-cookie") res.setHeader(k, v);
    });
    const cookies = out.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.send(Buffer.from(await out.arrayBuffer()));
  },
);

/** 매일 05:00 KST: 시설 수집 → 빈자리 알림 매칭·만료 안내·후속 질문 */
export const dailySync = onSchedule(
  { schedule: "0 5 * * *", timeZone: "Asia/Seoul", secrets: ALL, timeoutSeconds: 540, memory: "1GiB", retryCount: 1 },
  async () => {
    dropPlaceholders();
    const r = await runDaily();
    console.info("dailySync", JSON.stringify({ total: r.sync.total, changes: r.sync.changes, alerts: r.alerts }));
  },
);

/** 콘솔 등에서 Auth 계정이 지워져도 개인정보 삭제·연결 해제가 일어나게 한다 (withdraw 는 멱등) */
export const onUserDeleted = v1
  .region(REGION)
  .runWith({ secrets: ["NICKNAME_SECRET", "PKEY_SECRET"] })
  .auth.user()
  .onDelete(async (user) => {
    dropPlaceholders();
    await withdraw(user.uid);
  });
