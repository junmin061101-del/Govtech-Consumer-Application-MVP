import { json } from "@/lib/server/http";
import { regionsPayload } from "@/lib/server/regions";

// 경계 데이터는 배포 단위로만 바뀐다
export function GET() {
  return json(regionsPayload(), { headers: { "Cache-Control": "public, max-age=86400" } });
}
