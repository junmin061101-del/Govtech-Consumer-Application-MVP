import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * FIREBASE_SERVICE_ACCOUNT: 서비스 계정 키 JSON 전체. 원문 JSON 이든 base64 든 받는다
 * (Vercel 환경변수에 넣을 때 줄바꿈이 깨지는 문제를 base64 로 피할 수 있다).
 */
function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT 가 설정되지 않았습니다");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const acct = JSON.parse(json);
  // 환경변수를 거치며 \n 이 문자 그대로 들어온 경우 복원
  acct.private_key = String(acct.private_key).replace(/\\n/g, "\n");
  return acct;
}

export function adminAuth() {
  const app = getApps()[0] ?? initializeApp({ credential: cert(readServiceAccount()) });
  return getAuth(app);
}
