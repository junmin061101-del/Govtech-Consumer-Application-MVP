import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 웹 앱 설정값은 공개돼도 되는 값이다. 접근 제어는 Firestore 보안 규칙(firestore.rules)이 한다.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** 환경변수가 없으면 리뷰 기능만 '준비 중'으로 두고 나머지 앱은 그대로 동작하게 한다. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

const app = () => (getApps().length ? getApp() : initializeApp(config));

export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
