import { clientIp, handle, HttpError, json, rateLimit } from "@/lib/server/http";
import { coordToDong } from "@/lib/server/regions";

/** ?lat=&lng= → 행정동 코드. 좌표는 변환에만 쓰고 저장하지 않는다. */
export function GET(req: Request) {
  return handle(async () => {
    await rateLimit(`locate:${clientIp(req)}`, 60, 60_000);
    const url = new URL(req.url);
    const hit = coordToDong(Number(url.searchParams.get("lat")), Number(url.searchParams.get("lng")));
    if (!hit) throw new HttpError(404, "지원 지역 밖이에요");
    return json(hit);
  });
}
