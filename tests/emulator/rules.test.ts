// Firestore 보안 규칙: 기본 거부, 본인 프로필만 읽기, 서버 전용 컬렉션 차단, 리뷰 규칙
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-careos-rules",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/kakao:1"), { nickname: "포근한 다람쥐 001" });
    await setDoc(doc(db, "user_contacts/kakao:1"), { phone: "01012345678" });
    await setDoc(doc(db, "demand_events/e1"), { event_type: "search_result" });
    await setDoc(doc(db, "community_posts/p1"), { uid: "kakao:1", title: "글" });
  });
});

const as = (uid: string | null, claims: Record<string, unknown> = {}) =>
  (uid ? env.authenticatedContext(uid, claims) : env.unauthenticatedContext()).firestore();

describe("Firestore 규칙", () => {
  it("본인 프로필만 읽을 수 있고, 쓰기는 클라이언트에서 막힌다", async () => {
    await assertSucceeds(getDoc(doc(as("kakao:1"), "users/kakao:1")));
    await assertFails(getDoc(doc(as("kakao:2"), "users/kakao:1")));
    await assertFails(getDoc(doc(as(null), "users/kakao:1")));
    await assertFails(setDoc(doc(as("kakao:1"), "users/kakao:1"), { nickname: "바꿈" }));
  });

  it("연락처·이벤트·게시판 등 서버 전용 컬렉션은 본인이어도 읽기·쓰기 모두 막힌다", async () => {
    const db = as("kakao:1");
    await assertFails(getDoc(doc(db, "user_contacts/kakao:1")));
    await assertFails(getDoc(doc(db, "demand_events/e1")));
    await assertFails(setDoc(doc(db, "demand_events/e2"), { event_type: "search_result" }));
    await assertFails(getDoc(doc(db, "community_posts/p1")));
    await assertFails(getDoc(doc(db, "pkey_salts/kakao:1")));
    await assertFails(getDoc(doc(db, "anything/else")));
  });

  it("리뷰: 로그인 회원만 읽고, 본인 닉네임·문서 ID 규칙을 지켜야 쓸 수 있다", async () => {
    const mine = as("kakao:1", { nickname: "포근한 다람쥐 001" });
    const review = (uid: string, nickname: string) => ({
      facilityId: "fac1",
      uid,
      nickname,
      rating: 5,
      text: "좋아요",
      tags: ["kind"],
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(mine, "reviews/fac1_kakao:1"), review("kakao:1", "포근한 다람쥐 001")));
    await assertFails(setDoc(doc(mine, "reviews/fac1_kakao:2"), review("kakao:2", "포근한 다람쥐 001")));
    await assertFails(setDoc(doc(mine, "reviews/fac2_kakao:1"), review("kakao:1", "다른 이름")));
    await assertSucceeds(getDoc(doc(as("kakao:9"), "reviews/fac1_kakao:1")));
    await assertFails(getDoc(doc(as(null), "reviews/fac1_kakao:1")));
  });
});
