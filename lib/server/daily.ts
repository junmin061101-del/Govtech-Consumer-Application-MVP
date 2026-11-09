// 매일 작업: 서울 전 구 시설 수집 → 정원·현원 변화로 빈자리 알림 매칭·만료 안내·후속 질문.
// 배포 환경에서는 스케줄 함수 dailySync(functions/src/index.ts)가 부른다.
import { runAlertJob } from "./alerts";
import { syncFacilities } from "./facilities";
import { flags } from "./http";
import { buildAgentSummaries } from "./agentLog";
import { ensureIndex } from "./knowledge";

export async function runDaily(now = new Date()) {
  const sync = await syncFacilities(undefined, now);
  const alerts = (await flags()).vacancy ? await runAlertJob(sync.changes, now) : null;
  // AI 상담 지식 색인을 미리 갱신해 둔다 (문서가 바뀐 뒤 첫 질문이 느려지지 않게). 실패해도 수집 결과는 남긴다
  const knowledge = (await flags()).agent ? await ensureIndex().then((c) => c.length).catch((e) => String(e)) : null;
  // 구청 대시보드용 AI 상담 요약 (최근 30일)
  const agentSummaries = (await flags()).agent ? await buildAgentSummaries(now).catch((e) => String(e)) : null;
  return { sync: { ...sync, changes: sync.changes.length }, alerts, knowledge, agentSummaries };
}
