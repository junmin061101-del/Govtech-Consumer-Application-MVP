import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

// 웹 앱 설정값은 공개돼도 되는 값이다. 접근 제어는 Firestore 보안 규칙·App Check·API 권한 확인이 한다.
// NEXT_PUBLIC_USE_EMULATORS=true 면 로컬 에뮬레이터(Auth·Firestore)에 붙고, 설정값이 없어도 demo 프로젝트로 동작한다.
export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulators ? "demo-key" : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (useEmulators ? "demo-careos" : undefined),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (useEmulators ? "demo-app" : undefined),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let appCheck: AppCheck | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function app(): FirebaseApp {
  if (getApps().length) return getApp();
  const a = initializeApp(config);
  if (typeof window !== "undefined") {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;
    if (useEmulators || process.env.NEXT_PUBLIC_APP_CHECK_DEBUG === "true") {
      // 에뮬레이터·dev: 디버그 토큰 (콘솔에 출력된 토큰을 App Check 디버그 토큰으로 등록)
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    if (siteKey) {
      appCheck = initializeAppCheck(a, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    }
    if (config.measurementId && !useEmulators) void startAnalytics(a);
  }
  return a;
}

/**
 * Google Analytics: 광고 신호·Google 신호·광고 개인화를 모두 끈다. 사용자 속성은 설정하지 않는다(개인정보 금지).
 * 자동 수집되는 화면 조회 정도만 남는다.
 */
async function startAnalytics(a: FirebaseApp) {
  const { initializeAnalytics, isSupported, setConsent } = await import("firebase/analytics");
  if (!(await isSupported())) return;
  setConsent({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
  initializeAnalytics(a, { config: { allow_google_signals: false, allow_ad_personalization_signals: false } });
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(app());
    if (useEmulators) {
      // same-origin: 개발 서버가 Auth 에뮬레이터 요청을 중계한다 (Codespaces 처럼 브라우저가 9099 에 직접 못 닿을 때)
      const url = process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL || "http://127.0.0.1:9099";
      connectAuthEmulator(authInstance, url === "same-origin" ? window.location.origin : url, { disableWarnings: true });
    }
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
  }
  return dbInstance;
}

/** API 요청 헤더: Firebase ID 토큰 + App Check 토큰 */
export async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!firebaseConfigured) return headers;
  const a = auth();
  const user = a.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (appCheck) {
    try {
      headers["X-Firebase-AppCheck"] = (await getToken(appCheck)).token;
    } catch {
      /* App Check 토큰을 못 받으면 서버가 거절한다 */
    }
  }
  return headers;
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const extra = await authHeaders();
  return fetch(url, { ...init, headers: { ...extra, ...(init.headers as Record<string, string>) } });
}
