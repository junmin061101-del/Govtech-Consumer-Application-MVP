// Firebase Admin SDK (서버 전용).
// - Cloud Functions 안: 기본 서비스 계정으로 자동 초기화
// - 에뮬레이터(FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST): 자격 증명 없이 projectId 만으로 초기화
// - 그 밖(로컬에서 실제 프로젝트에 붙을 때): FIREBASE_SERVICE_ACCOUNT (JSON 원문 또는 base64)
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getRemoteConfig } from "firebase-admin/remote-config";

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const acct = JSON.parse(json);
  // 환경변수를 거치며 \n 이 문자 그대로 들어온 경우 복원
  acct.private_key = String(acct.private_key).replace(/\\n/g, "\n");
  return acct;
}

export const projectId = () =>
  process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "careos-dev";

export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const acct = readServiceAccount();
  return acct ? initializeApp({ credential: cert(acct), projectId: acct.project_id }) : initializeApp({ projectId: projectId() });
}

export const adminAuth = () => getAuth(adminApp());
export const adminAppCheck = () => getAppCheck(adminApp());
export const adminRemoteConfig = () => getRemoteConfig(adminApp());

let db: Firestore | null = null;
export function adminDb(): Firestore {
  if (!db) {
    db = getFirestore(adminApp());
    // 선택 필드(undefined)를 그대로 넘겨도 쓰기가 실패하지 않게 한다
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
