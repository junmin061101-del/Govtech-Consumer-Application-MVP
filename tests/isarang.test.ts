import { describe, expect, it } from "vitest";
import { isarangGuide, ISARANG_MENUS } from "@/lib/isarang";
import { MAX_IMAGE_B64, MAX_IMAGES, runTool, validateHistory } from "@/lib/server/agent";

const img = (data = "QUJD") => ({ inlineData: { mimeType: "image/jpeg", data } });
const user = (...parts: unknown[]) => ({ role: "user", parts });
const model = (text: string) => ({ role: "model", parts: [{ text }] });

describe("아이사랑 같이 하기", () => {
  it("할 일마다 바로가기·체크리스트를 주고, 신청은 부모가 직접 누르도록 안내한다", () => {
    const g = isarangGuide("apply", "구립상도어린이집")!;
    expect(g.links.map((l) => l.url)).toEqual([ISARANG_MENUS.login.url, ISARANG_MENUS.registerChild.url, ISARANG_MENUS.apply.url]);
    expect(g.steps.join(" ")).toContain("구립상도어린이집");
    expect(g.steps.at(-1)).toContain("직접 '신청' 버튼");
    expect(isarangGuide("status")!.links.at(-1)!.url).toBe("https://www.childcare.go.kr/?menuno=178");
    expect(isarangGuide("hack")).toBeNull();
  });

  it("AI 도구: 카드를 보여 줬다고만 답하고, 모르는 일은 오류", async () => {
    expect(await runTool("u1", "isarang_guide", { task: "status" })).toMatchObject({ task: "status", title: "등록대기 신청현황 확인" });
    expect(await runTool("u1", "isarang_guide", { task: "x" })).toHaveProperty("error");
  });
});

describe("화면 캡처 보내기", () => {
  it("부모가 보낸 JPEG·PNG 캡처는 대화당 3장까지 받는다", () => {
    const h = [user({ text: "이 화면 뭐야" }, img()), model("..."), user({ text: "다음" }, img()), model("..."), user({ text: "또" }, img())];
    expect(validateHistory(h)).toHaveLength(5);
    expect(MAX_IMAGES).toBe(3);
    expect(() => validateHistory([...h, model("..."), user({ text: "넷째" }, img())])).toThrow("3장");
  });

  it("다른 형식·너무 큰 이미지·AI 쪽 이미지는 막는다, 이미지 크기는 글자 기록 한도에 넣지 않는다", () => {
    expect(() => validateHistory([user({ inlineData: { mimeType: "application/pdf", data: "QUJD" } })])).toThrow("형식");
    expect(() => validateHistory([user({ text: "x" }, img("A".repeat(MAX_IMAGE_B64 + 4)))])).toThrow("너무 커요");
    expect(() => validateHistory([user({ text: "x" }), { role: "model", parts: [img()] }, user({ text: "y" })])).toThrow("형식");
    expect(() => validateHistory([user({ text: "x" }, img("<script>"))])).toThrow("형식");
    expect(validateHistory([user({ text: "큰 캡처" }, img("A".repeat(600_000)))])).toHaveLength(1);
  });
});
