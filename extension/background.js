// 아이사랑 탭 ↔ CareOS 탭 중계. 화면 캡처는 부모가 버튼을 누를 때만, 그 탭에서 보이는 부분만 찍는다.
const CAREOS = ["https://careos-dev-1103174.web.app/*", "http://localhost:3000/*"];
const ISARANG = "https://www.childcare.go.kr/*";

async function capture(windowId) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 70 });
  } catch {
    return null; // 권한이 없으면 요약 글자만 보낸다
  }
}

async function deliver(summary, image) {
  const tabs = await chrome.tabs.query({ url: CAREOS });
  if (!tabs.length) {
    const t = await chrome.tabs.create({ url: "https://careos-dev-1103174.web.app/agent", active: false });
    await new Promise((r) => setTimeout(r, 4000));
    tabs.push(t);
  }
  let ok = false;
  for (const t of tabs) {
    const r = await chrome.tabs.sendMessage(t.id, { type: "isarang-screen", summary, image }).catch(() => null);
    ok ||= Boolean(r?.ok);
  }
  return ok;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === "send-screen" && sender.tab?.url?.startsWith("https://www.childcare.go.kr/")) {
      const image = await capture(sender.tab.windowId);
      reply({ ok: await deliver(String(msg.summary || ""), image), image: Boolean(image) });
    } else if (msg?.type === "highlight") {
      const tabs = await chrome.tabs.query({ url: ISARANG });
      let ok = false;
      for (const t of tabs) ok ||= Boolean((await chrome.tabs.sendMessage(t.id, msg).catch(() => null))?.ok);
      reply({ ok });
    }
  })();
  return true;
});

// 도구 막대의 확장 아이콘: 지금 보는 아이사랑 탭을 요약·캡처해 보낸다 (activeTab 권한으로 캡처 가능)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith("https://www.childcare.go.kr/")) {
    await chrome.tabs.create({ url: "https://www.childcare.go.kr/" });
    return;
  }
  const r = await chrome.tabs.sendMessage(tab.id, { type: "summarize" }).catch(() => null);
  await deliver(r?.summary || "[아이사랑 화면 정보] (요약 실패)", await capture(tab.windowId));
});
