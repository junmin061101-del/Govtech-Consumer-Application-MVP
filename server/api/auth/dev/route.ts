import { authBackend } from "@/lib/server/auth";
import { handle, HttpError, isLocal, json, readJson } from "@/lib/server/http";
import { anonNickname, getProfile } from "@/lib/server/users";

// 개발용 로그인 (카카오 키 없이 가입·E2E 확인용). 에뮬레이터·테스트에서만 동작하고 실제 프로젝트에서는 항상 404.
export function POST(req: Request) {
  return handle(async () => {
    if (!isLocal() || process.env.DEV_LOGIN === "off") throw new HttpError(404, "not found");
    const { name } = await readJson<{ name: string }>(req);
    if (!/^[a-z0-9_-]{1,20}$/.test(name ?? "")) throw new HttpError(400, "영문 소문자·숫자로 적어 주세요");
    const uid = `dev:${name}`;
    const onboarded = Boolean(await getProfile(uid));
    const token = await authBackend().customToken(uid, { nickname: anonNickname(uid), onboarded });
    return json({ token, onboarded });
  });
}
