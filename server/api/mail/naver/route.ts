import { handle, json, rateLimit, readJson, requireMember } from "@/lib/server/http";
import { sendNaverMail, type MailInput } from "@/lib/server/mail";

/** 네이버 메일로 보내기. 앱 비밀번호·본문은 저장하지 않는다 (lib/server/mail.ts) */
export function POST(req: Request) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    await rateLimit(`mail:${uid}`, 10, 3_600_000);
    const input = await readJson<Partial<MailInput>>(req);
    return json(await sendNaverMail(input), { headers: { "Cache-Control": "no-store" } });
  });
}
