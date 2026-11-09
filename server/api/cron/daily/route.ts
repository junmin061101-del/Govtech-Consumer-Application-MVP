import { runDaily } from "@/lib/server/daily";
import { handle, HttpError, isLocal, json } from "@/lib/server/http";

// 매일 작업을 손으로 돌리는 경로 (에뮬레이터 전용). 배포 환경에서는 스케줄 함수 dailySync 가 돈다.
export function GET() {
  return handle(async () => {
    if (!isLocal()) throw new HttpError(404, "not found");
    return json(await runDaily());
  });
}
