// 새 기능 플래그. 배포 환경은 Remote Config(flag_<이름>), 에뮬레이터·테스트는 환경변수 FEATURE_FLAGS.
// 신청 안내는 별도 화면 없이 AI 상담(agent)이 맡는다.

export const FLAG_NAMES = ["matching", "vacancy", "community", "agent"] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export type Flags = Record<FlagName, boolean>;

export const FLAG_LABELS: Record<FlagName, string> = {
  matching: "돌봄 매칭 지도 (시간대·배지·조합·범위 넓히기)",
  vacancy: "빈자리 알림",
  community: "동네 게시판",
  agent: "AI 상담 (Gemini 에이전트)",
};

/** "community=off,apply=on" 형식. 적지 않은 플래그는 켜진 상태 */
export function readFlags(raw: string | undefined): Flags {
  const flags = Object.fromEntries(FLAG_NAMES.map((n) => [n, true])) as Flags;
  for (const part of (raw ?? "").split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim().toLowerCase());
    if ((FLAG_NAMES as readonly string[]).includes(k)) flags[k as FlagName] = !["off", "false", "0"].includes(v ?? "");
  }
  return flags;
}
