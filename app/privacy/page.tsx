import PageShell, { Card } from "@/components/PageShell";
import { PRIVACY_VERSION } from "@/lib/profile";

export const metadata = { title: "개인정보 처리방침 · CareOS" };

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-[6.5rem_1fr] gap-2 border-t border-stone-100 py-2 text-sm first:border-t-0">
    <dt className="text-stone-500">{k}</dt>
    <dd className="text-stone-800">{v}</dd>
  </div>
);

// TODO(질문): 개인정보 보호책임자, 처리 위탁 업체(알림톡 대행사·호스팅), 국외 이전 고지 문구는 확정 후 채운다.
export default function Privacy() {
  return (
    <PageShell title="개인정보 처리방침" back="/login">
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">법률 검토 전 초안이에요. 시행일 {PRIVACY_VERSION}</p>

      <Card title="1. 수집하는 정보와 목적">
        <dl>
          <Row k="필수" v="이메일·비밀번호(로그인. 비밀번호는 Firebase Authentication 이 암호화해 보관하며 CareOS 는 볼 수 없음), 약관·개인정보 동의 기록, 만 14세 이상 확인, 아이 연령(개월·만 나이), 관심 행정동 1~2개" />
          <Row k="선택" v="휴대폰 번호(인증된 번호, 빈자리 알림톡 발송용), 알림 수신 동의, AI 상담 대화 내용(아래 2-1, 동의한 경우만)" />
          <Row k="받지 않음" v="아이 이름·생년월일·사진, 보호자 실명·프로필 사진" />
          <Row k="이용 기록" v="검색 조건, AI 상담 익명 통계, 알림 등록·응답, 게시글" />
          <Row k="목적" v="조건에 맞는 시설 안내, 검색 조건 자동 채우기, 빈자리 알림 발송, 게시판 운영" />
        </dl>
      </Card>

      <Card title="2. 통계 이용 (가명 처리)">
        <p className="text-sm leading-relaxed text-stone-700">
          검색 결과 없음·신청 중단·빈자리 대기처럼 <b>돌봄을 찾다 멈춘 순간</b>을 통계로 남겨 돌봄 공급 개선에 씁니다. 통계 기록에는
          회원 식별자 원문·이름·연락처·정확한 좌표를 넣지 않고, 행정동 코드·시간대·연령대(영유아/초등)·시설 종류와 서버에서 만든
          가명 키만 남깁니다. 같은 조건을 24시간 안에 반복한 기록은 하나로 묶습니다.
        </p>
        <p className="text-sm leading-relaxed text-stone-700">
          AI 상담을 쓰면 상담마다 행정동·시간대·대상 연령대·문의 주제·결과(시설을 찾았는지 등)만 담은 익명 기록이 남고, 이를
          구·동 단위로 모은 통계와 요약을 관할 자치구청 보육 담당자가 볼 수 있습니다. 이 기록에는 대화 내용과 회원을 알아볼 수 있는
          정보가 없습니다.
        </p>
      </Card>

      <Card title="2-1. AI 상담 대화 내용 수집·이용과 제공 (선택 동의)">
        <dl>
          <Row k="수집 항목" v="AI 상담의 질문과 답변 원문(전화번호·이메일·이름·상세 주소 등은 자동으로 가림), 상담한 행정동·시간대·대상 연령대·문의 주제" />
          <Row k="목적" v="서비스 개선, 관할 구청의 돌봄 수요 파악과 정책 참고" />
          <Row k="제공받는 자" v="회원이 상담한 지역의 관할 자치구청 보육 담당 부서 (CareOS 구청 대시보드에서 권한을 받은 담당자만, 자기 구 것만 열람)" />
          <Row k="제공 항목" v="위 수집 항목 (회원 계정·이메일·닉네임은 제공하지 않음)" />
          <Row k="보관 기간" v="저장 후 90일 (지나면 자동 삭제), 동의 철회·탈퇴 시 즉시 삭제" />
          <Row k="거부 권리" v="동의하지 않아도 AI 상담을 포함한 모든 기능을 쓸 수 있습니다. '내 정보'에서 언제든 동의를 끌 수 있습니다." />
        </dl>
        <p className="text-xs leading-relaxed text-stone-500">
          자동 가림은 정해진 형태(전화번호 등)만 찾아내므로 완전하지 않습니다. 아이 이름·연락처 같은 개인정보는 대화에 적지 말아 주세요.
        </p>
      </Card>

      <Card title="3. 보관 기간과 파기">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>로그인 계정(이메일)·회원 정보·연락처·알림·신청 요약·게시글·리뷰: 탈퇴 즉시 삭제</li>
          <li>휴대폰 인증번호: 5분 후 무효, 인증 완료 시 즉시 삭제</li>
          <li>통계 기록: 탈퇴 시 가명 키를 만들 때 쓰는 회원별 값을 폐기해, 남은 기록을 회원과 다시 연결할 수 없게 합니다</li>
          <li>빈자리 알림: 등록 후 90일 지나면 종료</li>
          <li>AI 상담 대화 내용(동의한 경우): 저장 후 90일 자동 삭제, 동의 철회·탈퇴 시 즉시 삭제</li>
        </ul>
      </Card>

      <Card title="4. 외부 서비스">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>
            Google Firebase: 회원 정보·이용 기록 저장과 서버 운영은 서울 리전, 로그인 계정(이메일)은 Firebase Authentication 에
            보관(국외 저장 가능)
          </li>
          <li>카카오: 지도·장소 검색 (회원 정보는 보내지 않음)</li>
          <li>카카오 알림톡 발송 대행사: 알림 수신에 동의한 경우 휴대폰 번호와 알림 내용 (업체 확정 후 고지)</li>
          <li>
            Google Vertex AI(Gemini, 처리 위치: Google global 리전 — 국외 처리 가능): AI 상담에 직접 입력한 문장, 그리고
            답변에 필요한 아이 연령·관심 행정동·검색한 시설 정보, 그리고 '현재 위치 사용'을 켠 경우 현재 행정동과 대략 좌표(약 100m 단위)를
            답변을 만들 때만 보냅니다. 대화 기록은 이용 중인 브라우저 탭에 남고, CareOS 서버에는 대화 내용 수집에 동의한 경우에만
            개인정보를 가린 대화를 90일 보관합니다(위 2-1). 개인정보를 적지 말아 주세요.
          </li>
        </ul>
      </Card>

      <Card title="5. 회원의 권리">
        <p className="text-sm leading-relaxed text-stone-700">
          ‘내 정보’에서 언제든 정보를 확인·수정하고, 알림 수신 동의를 철회하고, 탈퇴할 수 있습니다.
        </p>
      </Card>

      <Card title="6. 개인정보 보호책임자">
        <p className="text-sm text-stone-500">확정 후 기재 예정</p>
      </Card>
    </PageShell>
  );
}
