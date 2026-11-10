// 서버 비밀값 (배포 환경에서는 Secret Manager → Functions 환경변수로 주입).
// 배포된 Functions 에서는 반드시 있어야 하고, 에뮬레이터·테스트에서만 고정 대체값으로 동작한다.
import { isDeployed } from "./env";

const warned = new Set<string>();

function secret(name: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (isDeployed()) {
    throw new Error(`${name} 가 설정되지 않았습니다`);
  }
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[careos] ${name} 가 없어 개발용 대체값을 씁니다. 운영에서는 반드시 설정하세요.`);
  }
  return `dev-only-${name}`;
}

/** 익명 닉네임 생성 (uid 를 이 값으로 해시한다) */
export const nicknameSecret = () => secret("NICKNAME_SECRET");
/** 이벤트 가명 키(pkey) 서버 솔트 */
export const pkeySecret = () => secret("PKEY_SECRET");
