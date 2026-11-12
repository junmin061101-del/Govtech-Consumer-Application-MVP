// 아이사랑(임신육아종합포털, www.childcare.go.kr) '같이 하기' 안내.
// 메뉴 번호는 2026-11-12 아이사랑 첫 화면의 링크에서 확인한 값이다 (바뀌면 여기만 고친다).
// CareOS 는 아이사랑에 로그인하거나 대신 신청하지 않는다. 부모가 직접 로그인·간편인증·신청 버튼을 누르고, AI 는 옆에서 안내한다.

export const ISARANG = "https://www.childcare.go.kr";
export const ISARANG_HELPDESK = "1566-3232";

export const ISARANG_MENUS = {
  login: { label: "아이사랑 로그인", url: `${ISARANG}/?menuno=50` },
  registerChild: { label: "등록대기 아동등록", url: `${ISARANG}/?menuno=616` },
  apply: { label: "등록대기 신청", url: `${ISARANG}/?menuno=175` },
  search: { label: "어린이집 검색", url: `${ISARANG}/?menuno=176` },
  status: { label: "등록대기 신청현황", url: `${ISARANG}/?menuno=178` },
} as const;

export type IsarangTask = "apply" | "status" | "register_child" | "login";

export interface IsarangGuide {
  task: IsarangTask;
  title: string;
  facility: string | null;
  links: { label: string; url: string }[];
  steps: string[];
  helpdesk: string;
}

const LOGIN_STEP = "아이사랑에 로그인해요 (간편인증·인증서·아이디 중 선택. 신청 단계에서는 간편인증이나 인증서가 필요할 수 있어요)";

export function isarangGuide(task: string, facility: string | null = null): IsarangGuide | null {
  const m = ISARANG_MENUS;
  const base = { facility, helpdesk: ISARANG_HELPDESK };
  switch (task) {
    case "login":
      return {
        ...base,
        task,
        title: "아이사랑 로그인",
        links: [m.login],
        steps: [
          "아이사랑 로그인 화면을 열어요",
          "간편인증(카카오·네이버·PASS 등), 인증서, 아이디 로그인 중 하나를 골라요",
          "기존 회원이 간편인증을 쓰려면 먼저 아이디로 로그인해 마이페이지 > 회원정보변경에서 본인인증을 저장해야 해요",
        ],
      };
    case "register_child":
      return {
        ...base,
        task,
        title: "등록대기 아동등록",
        links: [m.login, m.registerChild],
        steps: [LOGIN_STEP, "등록대기 > 아동등록에서 아이 정보를 등록해요 (신청 전에 먼저 필요할 수 있어요)", "등록한 내용을 확인하고 저장해요"],
      };
    case "status":
      return {
        ...base,
        task,
        title: "등록대기 신청현황 확인",
        links: [m.login, m.status],
        steps: [LOGIN_STEP, "등록대기 > 신청현황에서 신청한 어린이집과 대기 순번을 확인해요", "궁금한 점이 있으면 화면을 캡처해 보내 주세요"],
      };
    case "apply":
      return {
        ...base,
        task,
        title: facility ? `${facility} 등록대기 신청` : "어린이집 등록대기 신청",
        links: [m.login, m.registerChild, m.apply],
        steps: [
          LOGIN_STEP,
          "등록대기 아동등록이 되어 있는지 확인해요 (없으면 먼저 등록)",
          facility ? `등록대기 신청에서 '${facility}'을(를) 검색해 '등록대기신청'을 눌러요` : "등록대기 신청에서 원하는 어린이집을 검색해 '등록대기신청'을 눌러요",
          "입소 희망일·우선순위(맞벌이·다자녀 등)를 고르고 필요한 증빙을 확인해요",
          "마지막 확인 화면에서 내용을 꼼꼼히 본 뒤, 직접 '신청' 버튼을 눌러요",
        ],
      };
    default:
      return null;
  }
}
