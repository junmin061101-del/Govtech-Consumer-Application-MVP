// 신청 도우미 지침 문서(content/apply-guides/*.md) 파서. 형식은 content/apply-guides/README.md 참고.
import type { FacilityKind } from "./types";

export interface GuideItem {
  id: string;
  text: string;
  /** 이 우선순위 중 하나를 골랐을 때만 보이는 항목 */
  when: string[];
}

export interface GuideLink {
  label: string;
  url: string;
  text: string;
}

export interface Guide {
  id: string;
  title: string;
  kinds: FacilityKind[];
  sigunguCode: string | null;
  source: string;
  sourceUrl: string;
  asOf: string;
  reviewed: boolean;
  overview: string;
  priorities: GuideItem[];
  documents: GuideItem[];
  channels: GuideLink[];
  contacts: GuideItem[];
  programs: GuideItem[];
  /** LLM 에 근거로 넘기는 원문 (frontmatter 제외) */
  body: string;
}

const SECTION: Record<string, keyof Pick<Guide, "priorities" | "documents" | "contacts" | "programs">> = {
  우선순위: "priorities",
  "필요 서류": "documents",
  "구청 연락처": "contacts",
  "구별 지원사업": "programs",
};

export function parseGuide(raw: string, fallbackId = ""): Guide {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const front: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = (m?.[2] ?? raw).trim();

  const g: Guide = {
    id: front.id || fallbackId,
    title: front.title ?? "",
    kinds: (front.kinds ?? "").split(",").map((k) => k.trim()).filter(Boolean) as FacilityKind[],
    sigunguCode: front.sigungu_code || null,
    source: front.source ?? "",
    sourceUrl: front.source_url ?? "",
    asOf: front.as_of ?? "",
    reviewed: front.reviewed === "true",
    overview: "",
    priorities: [],
    documents: [],
    channels: [],
    contacts: [],
    programs: [],
    body,
  };

  let section = "";
  const overview: string[] = [];
  for (const line of body.split("\n")) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    if (section === "개요") {
      if (line.trim()) overview.push(line.trim());
      continue;
    }
    if (section === "신청 창구") {
      const link = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(.*)$/);
      if (link) g.channels.push({ label: link[1], url: link[2], text: link[3].trim() });
      continue;
    }
    const key = SECTION[section];
    const item = line.match(/^-\s*\{([\w-]+)\}\s*(.+?)(?:\s*\|\s*when:\s*(.+))?$/);
    if (key && item) {
      g[key].push({
        id: item[1],
        text: item[2].trim(),
        when: (item[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      });
    }
  }
  g.overview = overview.join(" ");
  return g;
}

/** 고른 우선순위에 맞는 서류 목록 (공통 서류 + 해당 서류) */
export function documentsFor(guide: Pick<Guide, "documents">, priorities: string[]): GuideItem[] {
  return guide.documents.filter((d) => d.when.length === 0 || d.when.some((w) => priorities.includes(w)));
}

/** 시설 종류 → 지침 문서 ID */
export function guideIdForKind(kind: FacilityKind): string {
  if (kind === "daycare") return "daycare";
  if (kind === "kindergarten") return "kindergarten";
  return "school-age";
}
