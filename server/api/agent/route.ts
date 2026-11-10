import { agentStep, TOOL_LABELS, validateHistory } from "@/lib/server/agent";
import { recordTurn } from "@/lib/server/agentLog";
import { handle, json, rateLimit, readJson, requireFlag, requireMember } from "@/lib/server/http";

/**
 * AI 상담 한 단계. { contents } 를 받아 Gemini 를 한 번 부르고, 도구를 썼으면 결과까지 붙여 돌려준다.
 * done=false 면 브라우저가 늘어난 기록으로 다시 부른다. 대화 원문은 서버에 저장하지 않는다.
 */
export function POST(req: Request) {
  return handle(async () => {
    await requireFlag("agent");
    const { uid } = await requireMember(req);
    await rateLimit(`agent:${uid}`, 60, 600_000);
    await rateLimit(`agent-day:${uid}`, 400, 86_400_000);
    const { contents } = await readJson<{ contents: unknown }>(req);
    const history = validateHistory(contents);
    const step = await agentStep(uid, history);
    // 답이 끝났으면 구청 대시보드용 기록을 남긴다 (익명 집계 + 동의한 회원만 대화 로그). 실패해도 답은 돌려준다
    if (step.done) await recordTurn(uid, [...history, ...step.append]).catch((e) => console.error("recordTurn failed", e));
    return json({ ...step, toolLabels: step.tools.map((t) => TOOL_LABELS[t] ?? t) });
  });
}
