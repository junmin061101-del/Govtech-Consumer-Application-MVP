// 클라이언트 → /api/events. 서버의 logDemandEvent 가 검증·가명 처리 후 저장한다.
import type { DemandEventInput } from "./events";
import { authFetch } from "./firebase";

/** 실패해도 화면 동작에는 영향이 없어야 하므로 결과를 기다리지 않는다. */
export function logEvent(input: DemandEventInput) {
  if (typeof window === "undefined") return;
  authFetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}
