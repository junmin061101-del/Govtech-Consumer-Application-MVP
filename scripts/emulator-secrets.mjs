// Functions 에뮬레이터용 비밀값 자리표시(functions/.secret.local). 이미 있으면 그대로 둔다.
import fs from "node:fs";
const file = new URL("../functions/.secret.local", import.meta.url);
const names = ["PKEY_SECRET", "NICKNAME_SECRET", "SEOUL_OPEN_API_KEY", "DATA_GO_KR_SERVICE_KEY", "KAKAO_REST_API_KEY", "NAVER_API_HUB_CLIENT_ID", "NAVER_API_HUB_CLIENT_SECRET"];
const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const missing = names.filter((n) => !new RegExp(`^${n}=`, "m").test(have));
if (missing.length) {
  fs.writeFileSync(file, have + (have && !have.endsWith("\n") ? "\n" : "") + missing.map((n) => `${n}=-`).join("\n") + "\n");
  console.log(`functions/.secret.local 에 ${missing.join(", ")} 자리를 만들었습니다 (값은 '-' = 없음). 필요한 값만 채우세요.`);
}
