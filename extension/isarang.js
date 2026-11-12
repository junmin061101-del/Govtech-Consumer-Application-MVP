// 아이사랑(www.childcare.go.kr) 화면에서 동작. 사람이 보고 있는 화면을 요약해 CareOS 로 보내고, AI 가 가리킨 버튼에 표시만 한다.
// 하지 않는 것: 클릭·입력·제출, 입력칸 값(비밀번호 포함) 읽기, 자동 로그인.
(() => {
  if (window.__careosIsarang) return;
  window.__careosIsarang = true;

  const MAX = 4000;
  const mask = (s) =>
    String(s || "")
      .replace(/\d{6}\s*-\s*[1-8]\d{6}/g, "[주민번호]")
      .replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "[전화번호]")
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[이메일]")
      .replace(/\s+/g, " ")
      .trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };
  const textOf = (el) => mask(el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").slice(0, 60);
  const CLICKABLE = "a, button, input[type=submit], input[type=button], [role=button], [onclick]";

  /** 화면 요약: 제목·경고·버튼/링크 글자·입력칸 이름(값은 빼고 채워졌는지만) */
  function summarize() {
    const lines = [`[아이사랑 화면 정보] ${mask(document.title)}`, `주소: ${location.pathname}${location.search.replace(/state=\d+&?/, "")}`];
    const heads = [...document.querySelectorAll("h1, h2, h3, .tit, .title")].filter(visible).map(textOf).filter(Boolean);
    if (heads.length) lines.push(`제목: ${[...new Set(heads)].slice(0, 8).join(" / ")}`);
    const alerts = [...document.querySelectorAll("[role=alert], .error, .err, .alert, .msg, .txt_red, .red")].filter(visible).map(textOf).filter(Boolean);
    if (alerts.length) lines.push(`안내·오류: ${[...new Set(alerts)].slice(0, 6).join(" / ")}`);
    const fields = [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => visible(el) && !["hidden", "submit", "button"].includes(el.type))
      .map((el) => {
        const label = (el.labels && el.labels[0] && textOf(el.labels[0])) || el.placeholder || el.title || el.name || el.type;
        const filled = el.type === "checkbox" || el.type === "radio" ? el.checked : Boolean(el.value);
        return `${mask(label).slice(0, 30)}(${el.type === "password" ? "비밀번호" : el.tagName === "SELECT" ? "선택" : el.type}${filled ? ", 채움" : ""})`;
      });
    if (fields.length) lines.push(`입력칸: ${fields.slice(0, 25).join(", ")}`);
    const clicks = [...new Set([...document.querySelectorAll(CLICKABLE)].filter(visible).map(textOf).filter((t) => t && t.length > 1))];
    lines.push(`누를 수 있는 것: ${clicks.slice(0, 80).join(" | ")}`);
    return lines.join("\n").slice(0, MAX);
  }

  // --- AI 가 가리킨 버튼 표시 (누르지 않는다) ---
  let marked = null;
  let bubble = null;
  function clear() {
    if (marked) marked.style.outline = marked.dataset.careosOutline || "";
    marked = null;
    bubble?.remove();
    bubble = null;
  }
  function highlight(target, note) {
    clear();
    const want = String(target || "").replace(/\s+/g, " ").trim();
    if (!want) return false;
    const els = [...document.querySelectorAll(CLICKABLE + ", label, th, li")].filter(visible);
    const norm = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const el = els.find((e) => norm(e) === want) || els.filter((e) => norm(e).includes(want)).sort((a, b) => norm(a).length - norm(b).length)[0];
    if (!el) return false;
    marked = el;
    el.dataset.careosOutline = el.style.outline;
    el.style.outline = "4px solid #059669";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    bubble = document.createElement("div");
    bubble.textContent = `CareOS: ${note || "여기를 눌러 주세요"}`;
    Object.assign(bubble.style, {
      position: "absolute", zIndex: 2147483647, background: "#059669", color: "#fff", font: "600 13px sans-serif",
      padding: "6px 10px", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,.2)", pointerEvents: "none", maxWidth: "260px",
    });
    document.body.appendChild(bubble);
    const r = el.getBoundingClientRect();
    bubble.style.left = `${Math.max(8, window.scrollX + r.left)}px`;
    bubble.style.top = `${window.scrollY + r.bottom + 8}px`;
    setTimeout(clear, 20000);
    return true;
  }

  // --- 화면 왼쪽 아래 'CareOS 로 이 화면 보내기' 버튼 ---
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "📤 CareOS 에 이 화면 보내기";
  Object.assign(btn.style, {
    position: "fixed", left: "16px", bottom: "16px", zIndex: 2147483646, background: "#059669", color: "#fff", border: "0",
    borderRadius: "999px", padding: "10px 14px", font: "600 13px sans-serif", boxShadow: "0 4px 14px rgba(0,0,0,.25)", cursor: "pointer",
  });
  btn.addEventListener("click", async () => {
    btn.textContent = "보내는 중…";
    const r = await chrome.runtime.sendMessage({ type: "send-screen", summary: summarize() }).catch(() => null);
    // 페이지 안 버튼으로는 브라우저가 화면 캡처를 허락하지 않는다 → 캡처까지 보내려면 도구 막대의 CareOS 아이콘
    btn.textContent = !r?.ok
      ? "CareOS 상담 창을 먼저 열어 주세요"
      : r.image
        ? "✓ 화면 정보·캡처를 붙였어요"
        : "✓ 화면 정보를 붙였어요 (캡처는 도구 막대 CareOS 아이콘)";
    setTimeout(() => (btn.textContent = "📤 CareOS 에 이 화면 보내기"), 4000);
  });
  document.documentElement.appendChild(btn);

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "summarize") reply({ summary: summarize() });
    else if (msg?.type === "highlight") reply({ ok: highlight(msg.text, msg.note) });
  });
})();
