// 정적 빌드(out/)에 비밀값이나 서버 코드가 섞이지 않았는지 검사한다. CI 에서 next build 뒤에 실행.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "out";
const FORBIDDEN = [
  // 서버 비밀값 이름이 클라이언트 코드에 나오면 안 된다
  /\b(PKEY_SECRET|NICKNAME_SECRET|KAKAO_CLIENT_SECRET|KAKAO_REST_API_KEY|SEOUL_OPEN_API_KEY|DATA_GO_KR_SERVICE_KEY|ANTHROPIC_API_KEY|FIREBASE_SERVICE_ACCOUNT)\b/,
  /sk-ant-[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
  /"private_key"\s*:/,
  // 서버 전용 모듈 흔적
  /firebase-admin|node:crypto|lib\/server\//,
];

const hits = [];
function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(js|html|json|txt)$/.test(e.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${full}: ${re}`);
    }
  }
}
if (!fs.existsSync(dir)) {
  console.error(`${dir} 가 없습니다. next build 를 먼저 실행하세요.`);
  process.exit(2);
}
walk(dir);
if (hits.length) {
  console.error("클라이언트 번들에서 금지된 내용을 찾았습니다:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`ok: ${dir} 에 비밀값·서버 코드 흔적 없음`);
