import { describe, expect, it } from "vitest";
import { documentsFor, guideIdForKind, parseGuide } from "@/lib/applyGuide";
import { loadGuide, loadSigunguGuide } from "@/lib/server/applyGuides";

describe("안내 문서 (AI 상담 검색 원천)", () => {
  it("모든 공통 문서에 출처·기준일·신청 창구가 있다", () => {
    for (const id of ["daycare", "kindergarten", "school-age"]) {
      const g = loadGuide(id)!;
      expect(g.source, id).toBeTruthy();
      expect(g.asOf, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.channels.length, id).toBeGreaterThan(0);
      expect(g.priorities.length, id).toBeGreaterThan(0);
      // 서류의 when 은 그 문서의 우선순위 ID 만 가리킨다
      const ids = new Set(g.priorities.map((p) => p.id));
      expect(g.documents.flatMap((d) => d.when).every((w) => ids.has(w)), id).toBe(true);
    }
    expect(loadGuide("daycare")!.channels[0].url).toBe("https://www.childcare.go.kr/?menuno=175");
  });

  it("고른 우선순위에 해당하는 서류만 더한다", () => {
    const g = loadGuide("daycare")!;
    const common = documentsFor(g, []).map((d) => d.id);
    expect(common).toEqual(["d_auth"]);
    expect(documentsFor(g, ["p_dual"]).map((d) => d.id)).toEqual(["d_auth", "d_employ"]);
  });

  it("구별 문서는 sigungu_code 로 고르고, 없으면 null, 경로 조작은 막는다", () => {
    expect(loadSigunguGuide("11590")).toBeNull();
    expect(loadSigunguGuide("../daycare")).toBeNull();
    expect(loadGuide("../../package")).toBeNull();
    const g = parseGuide("---\nsigungu_code: 11590\ntitle: 동작구\nreviewed: true\n---\n## 구청 연락처\n- {c1} 보육팀\n");
    expect(g).toMatchObject({ sigunguCode: "11590", reviewed: true, contacts: [{ id: "c1", text: "보육팀", when: [] }] });
  });

  it("시설 종류별로 문서를 고른다", () => {
    expect(guideIdForKind("daycare")).toBe("daycare");
    expect(guideIdForKind("kiumcenter")).toBe("school-age");
  });

});
