import { sessionFrom } from "@/lib/server/auth";
import { flags, handle, isAdmin, json, readJson, requireLogin, requireMember } from "@/lib/server/http";
import { anonNickname, getProfileView, updateProfile, withdraw, type ProfileUpdate } from "@/lib/server/users";

export function GET(req: Request) {
  return handle(async () => {
    const s = await sessionFrom(req);
    if (!s) return json({ user: null, profile: null, flags: await flags() });
    return json({
      user: { uid: s.uid, nickname: anonNickname(s.uid), isAdmin: isAdmin(s.uid, s.email), onboarded: s.onboarded },
      profile: await getProfileView(s.uid),
      flags: await flags(),
    });
  });
}

export function PUT(req: Request) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    await updateProfile(uid, await readJson<ProfileUpdate>(req));
    return json({ profile: await getProfileView(uid) });
  });
}

/** 회원 탈퇴: 개인정보 즉시 삭제 + 이벤트 가명 키 연결 해제 + Firebase Auth 계정 삭제 */
export function DELETE(req: Request) {
  return handle(async () => {
    const { uid } = await requireLogin(req);
    await withdraw(uid);
    return json({ ok: true });
  });
}
