// 기능 플래그 (서버). 실제 프로젝트에서는 Remote Config 템플릿을 읽고(1분 캐시),
// 에뮬레이터·테스트에서는 환경변수 FEATURE_FLAGS 를 쓴다. Remote Config 매개변수 이름: flag_matching 등.
import { adminRemoteConfig } from "@/lib/firebaseAdmin";
import { FLAG_NAMES, readFlags, type Flags } from "@/lib/flags";
import { isDeployed } from "./env";

const CACHE_MS = 60_000;
let cache: { at: number; flags: Flags } | null = null;

const useRemoteConfig = () =>
  process.env.FLAGS_SOURCE === "remote-config" ||
  (process.env.FLAGS_SOURCE !== "env" && isDeployed());

export async function readServerFlags(now = Date.now()): Promise<Flags> {
  const fromEnv = readFlags(process.env.FEATURE_FLAGS);
  if (!useRemoteConfig()) return fromEnv;
  if (cache && now - cache.at < CACHE_MS) return cache.flags;
  try {
    // firebase deploy --only remoteconfig 로 올린 템플릿(remoteconfig.template.json)의 기본값을 읽는다
    const template = await adminRemoteConfig().getTemplate();
    const value = (n: string) => {
      const d = template.parameters[`flag_${n}`]?.defaultValue as { value?: string } | undefined;
      return d?.value === undefined ? fromEnv[n as keyof Flags] : d.value === "true";
    };
    const flags = Object.fromEntries(FLAG_NAMES.map((n) => [n, value(n)])) as Flags;
    cache = { at: now, flags };
    return flags;
  } catch (e) {
    console.error("remote config read failed, using env flags", e);
    // 실패해도 1분은 환경변수 값으로 버텨 매 요청마다 다시 부르지 않는다
    cache = { at: now, flags: cache?.flags ?? fromEnv };
    return cache.flags;
  }
}
