// CareOS 화면에서 동작. 페이지(AI 상담)와 확장 프로그램 사이에서 정해진 메시지만 전달한다.
(() => {
  document.documentElement.dataset.careosExt = "0.1.0";
  // 확장 → 페이지: 아이사랑 화면 요약·캡처를 AI 상담에 첨부
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== "isarang-screen") return;
    window.postMessage({ source: "careos-ext", type: "isarang-screen", summary: String(msg.summary || "").slice(0, 4000), image: msg.image || null }, location.origin);
    reply({ ok: true });
  });
  // 페이지 → 확장: AI 가 가리킨 아이사랑 버튼 표시
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (d?.source !== "careos-app" || d.type !== "highlight") return;
    chrome.runtime.sendMessage({ type: "highlight", text: String(d.text || "").slice(0, 60), note: String(d.note || "").slice(0, 80) }).catch(() => {});
  });
})();
