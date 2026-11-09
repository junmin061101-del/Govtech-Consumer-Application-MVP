// 실행 환경 판정 (서버 전용).
// - 배포된 Cloud Functions: K_SERVICE 가 있고 FUNCTIONS_EMULATOR 가 없다
// - 에뮬레이터: FUNCTIONS_EMULATOR=true
// - 테스트(vitest): NODE_ENV=test

export const isDeployed = () => Boolean(process.env.K_SERVICE) && process.env.FUNCTIONS_EMULATOR !== "true";

/** 에뮬레이터·테스트처럼 실제 프로젝트가 아닌 환경. 개발용 로그인·인증번호 노출은 여기서만 */
export const isLocal = () => process.env.NODE_ENV === "test" || process.env.FUNCTIONS_EMULATOR === "true";
