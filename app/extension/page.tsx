import PageShell, { Card } from "@/components/PageShell";

export const metadata = { title: "CareOS 신청 도우미 (PC 확장 프로그램) · CareOS" };

export default function ExtensionGuide() {
  return (
    <PageShell title="CareOS 신청 도우미" back="/agent">
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        시험판(0.1)이에요. 컴퓨터의 Chrome·Edge 에서만 쓸 수 있어요 (휴대폰 브라우저는 확장 프로그램을 지원하지 않아요).
      </p>

      <Card title="무엇을 하나요">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>아이사랑 화면 왼쪽 아래 &lsquo;📤 CareOS 에 이 화면 보내기&rsquo;를 누르면 지금 화면의 버튼·제목·안내 문구가, 브라우저 도구 막대의 CareOS 아이콘을 누르면 화면 캡처까지 AI 상담에 첨부돼요.</li>
          <li>AI 가 다음에 누를 버튼을 아이사랑 화면에 초록 테두리와 말풍선으로 표시해요.</li>
          <li>로그인·간편인증·신청 버튼은 직접 눌러요. 도우미는 누르거나 입력하지 않아요.</li>
        </ul>
      </Card>

      <Card title="읽지 않는 것">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>입력칸에 적은 값(아이디·비밀번호·주민번호 등)은 읽지 않고, &lsquo;채움&rsquo; 여부만 봐요.</li>
          <li>화면 글자 중 주민등록번호·전화번호·이메일 형식은 가려서 보내요. 캡처에는 화면이 그대로 찍히니, 보내기 전에 미리보기를 확인해 주세요.</li>
          <li>첨부는 AI 상담의 &lsquo;보내기&rsquo;를 눌러야 보내져요. 서버에 저장하지 않아요.</li>
          <li>아이사랑(www.childcare.go.kr)과 CareOS 화면에서만 동작해요.</li>
        </ul>
      </Card>

      <Card title="설치 (약 1분)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700">
          <li>
            <a href="/extension/careos-helper.zip" download className="font-semibold text-emerald-700 underline">
              careos-helper.zip 받기
            </a>{" "}
            → 압축을 풀어요.
          </li>
          <li>Chrome 주소창에 <code className="rounded bg-stone-100 px-1">chrome://extensions</code> (Edge 는 <code className="rounded bg-stone-100 px-1">edge://extensions</code>)를 열어요.</li>
          <li>오른쪽 위 &lsquo;개발자 모드&rsquo;를 켜요.</li>
          <li>&lsquo;압축해제된 확장 프로그램을 로드합니다&rsquo;를 눌러 압축을 푼 폴더를 골라요.</li>
          <li>CareOS AI 상담을 열어 두고, 다른 탭에서 아이사랑을 열면 왼쪽 아래에 보내기 버튼이 보여요.</li>
        </ol>
      </Card>

      <Card title="같이 쓰면 좋은 것">
        <p className="text-sm leading-relaxed text-stone-700">
          AI 상담의 💬 버튼 → &lsquo;작게 띄우기&rsquo;로 상담 창을 아이사랑 옆에 항상 띄워 두면, 화면을 보내고 답을 보면서 바로 진행할 수 있어요.
        </p>
      </Card>
    </PageShell>
  );
}
