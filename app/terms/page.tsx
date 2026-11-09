import PageShell, { Card } from "@/components/PageShell";
import { TERMS_VERSION } from "@/lib/profile";

export const metadata = { title: "이용약관 · CareOS" };

// TODO(질문): 운영 주체(상호·대표자·연락처)와 문구는 법률 검토 후 확정한다. 지금은 초안이다.
export default function Terms() {
  return (
    <PageShell title="이용약관" back="/login">
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">법률 검토 전 초안이에요. 시행일 {TERMS_VERSION}</p>
      <Card title="제1조 (목적)">
        <p className="text-sm leading-relaxed text-stone-700">
          이 약관은 CareOS(이하 “서비스”)가 제공하는 돌봄 시설 찾기·신청 안내·빈자리 알림·동네 게시판 서비스의 이용 조건과
          절차를 정합니다.
        </p>
      </Card>
      <Card title="제2조 (이용 대상)">
        <p className="text-sm leading-relaxed text-stone-700">
          서비스는 만 0~8세 자녀를 둔 <b>만 14세 이상 보호자</b>를 위한 서비스입니다. 만 14세 미만은 가입할 수 없습니다.
        </p>
      </Card>
      <Card title="제3조 (정보의 성격)">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>시설 정보는 공공데이터와 지도 서비스에서 받은 자료이며, 정원·현원으로 계산한 빈자리는 추정치입니다.</li>
          <li>서비스는 입소·입학 자격이나 가능 여부를 판정하지 않습니다. 자리 여부와 자격은 시설과 공식 창구에서 꼭 확인해 주세요.</li>
          <li>AI 상담의 신청 안내는 출처와 기준일이 표시된 안내 문서를 요약한 것이며, 정책은 바뀔 수 있습니다.</li>
        </ul>
      </Card>
      <Card title="제4조 (게시판 이용)">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>게시판에서는 자동으로 만든 익명 닉네임만 보입니다.</li>
          <li>아이 이름·얼굴 사진·전화번호·상세 주소 등 개인정보는 올릴 수 없으며, 감지되면 게시가 막힙니다.</li>
          <li>링크·연락처가 담긴 글은 검토 후 공개되고, 신고가 쌓인 글은 자동으로 숨겨질 수 있습니다.</li>
          <li>타인을 비방하거나 광고·영리 목적의 글은 삭제될 수 있습니다.</li>
        </ul>
      </Card>
      <Card title="제5조 (알림)">
        <p className="text-sm leading-relaxed text-stone-700">
          빈자리 알림은 계정당 3개까지, 등록일로부터 90일 동안 받을 수 있고 언제든 해지할 수 있습니다. 알림은 공개자료 변화에 따른
          안내이며 자리를 보장하지 않습니다.
        </p>
      </Card>
      <Card title="제6조 (탈퇴)">
        <p className="text-sm leading-relaxed text-stone-700">
          회원은 언제든 ‘내 정보’에서 탈퇴할 수 있으며, 탈퇴 즉시 개인정보는 삭제됩니다. 자세한 내용은 개인정보 처리방침을 따릅니다.
        </p>
      </Card>
    </PageShell>
  );
}
