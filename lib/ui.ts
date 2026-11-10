// 화면 공통 스타일 조각과 API 호출. 기존 필터바의 칩·버튼 모양을 새 화면에서도 그대로 쓴다.
import { authFetch } from "./firebase";

export const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm transition ${
    on
      ? "border-emerald-600 bg-emerald-600 font-semibold text-white"
      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
  }`;

export const primaryBtn =
  "block w-full rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
export const secondaryBtn =
  "rounded-xl border border-stone-300 px-3 py-2.5 text-center text-sm font-medium text-stone-800 disabled:opacity-50";
export const input =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600";
export const select = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

/** 06:00 ~ 24:00, 30분 단위 */
export const TIMES = Array.from({ length: 37 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

/** /api 호출. 로그인했으면 ID 토큰·App Check 토큰을 붙인다 */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await authFetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "잠시 후 다시 시도해 주세요");
  return j as T;
}
