import { authBackend } from "@/lib/server/auth";
import { handle, json, readJson, requireLogin } from "@/lib/server/http";
import { signup, type SignupInput } from "@/lib/server/users";

export function POST(req: Request) {
  return handle(async () => {
    const { uid } = await requireLogin(req);
    const profile = await signup(uid, await readJson<SignupInput>(req));
    // 가입 완료를 ID 토큰 클레임에 남긴다. 클라이언트는 토큰을 새로 받아(getIdToken(true)) 반영한다.
    await authBackend().setOnboarded(uid, profile.nickname);
    return json({ profile });
  });
}
