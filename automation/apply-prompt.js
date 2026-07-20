#!/usr/bin/env node
// ============================================================
// apply-prompt.js — [Phase B · 게이트] 어드민 프롬프트 자동 반영
// 사용법:
//   node apply-prompt.js --url <프롬프트 URL> --file <반영할 md 파일> [--confirm]
// 기본은 DRY-RUN: 로그인 → 프롬프트 페이지 이동 → 기존 값 백업 → 새 값 입력 →
//   '미리보기' 스크린샷까지만. `--confirm` 이 있어야 '수정'(저장)을 실제 클릭.
// ⚠ 프로덕션 쓰기. 셀렉터는 실제 폼에서 검증 필요(config.adminPromptSelectors).
// ============================================================
require("./lib/env").requireEnv([]);
const fs = require("fs");
const path = require("path");
const cfg = require("./lib/config");
const puppeteer = require("puppeteer");

// 어드민은 Google SSO → ID/PW 로그인 불가. bootstrap-admin.js 로 저장한 세션을 재사용.
async function openAdminPage(url) {
  const browser = await puppeteer.launch({
    headless: cfg.headless ? "new" : false,
    executablePath: cfg.chromePath || undefined,
    userDataDir: path.join(cfg.sessionDir, "admin"),
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,1000"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 40000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000)); // SPA 렌더 대기
  if (page.url().includes("/login")) {
    await shotP(page, "admin-need-login");
    console.error("❌ 어드민 세션 없음/만료. 먼저 `node bootstrap-admin.js` 로 구글 로그인 1회 해주세요.");
    await browser.close();
    process.exit(2);
  }
  return {
    browser, page,
    shot: (name) => shotP(page, name),
    async close() { try { await browser.close(); } catch {} },
  };
}
async function shotP(page, name) {
  try {
    fs.mkdirSync(cfg.screenshotDir, { recursive: true });
    const p = path.join(cfg.screenshotDir, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: true });
    console.error(`   🖼  스크린샷: ${p}`);
  } catch {}
}

function arg(name, def = null) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const url = arg("--url");
const file = arg("--file");
const confirm = process.argv.includes("--confirm");
if (!url || !file) { console.error("사용법: node apply-prompt.js --url <프롬프트 URL> --file <md> [--confirm]"); process.exit(1); }
if (!fs.existsSync(file)) { console.error(`❌ 파일 없음: ${file}`); process.exit(1); }
const newPrompt = fs.readFileSync(file, "utf8");
const S = cfg.adminPromptSelectors;

(async () => {
  if (!S.promptTextarea || !S.saveBtn) {
    console.error("⚠ 어드민 셀렉터 미설정(SEL_ADMIN_PROMPT/SEL_ADMIN_SAVE 등). 실제 폼에서 확인해 .env.local 에 지정하세요.");
    console.error("  지금은 로그인+페이지 이동+스크린샷까지만 진행합니다(안전).");
  }
  const s = await openAdminPage(url);
  try {
    await s.shot("admin-before");

    // 기존 값 백업
    let oldVal = "";
    try { oldVal = await s.page.$eval(S.promptTextarea, (el) => el.value || el.textContent || ""); } catch {}
    if (oldVal) {
      fs.mkdirSync(cfg.outDir, { recursive: true });
      const bak = path.join(cfg.outDir, `prompt-backup-${Date.now()}.md`);
      fs.writeFileSync(bak, oldVal);
      console.log(`💾 기존 프롬프트 백업: ${bak}`);
    }

    // 새 값 입력 (셀렉터 있을 때만)
    if (S.promptTextarea) {
      try {
        await s.page.$eval(S.promptTextarea, (el, v) => {
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
          if (setter && setter.set) setter.set.call(el, v); else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, newPrompt);
        console.log("✏️  새 프롬프트 입력 완료(폼 상태).");
      } catch (e) { console.error("입력 실패:", e.message); await s.shot("admin-input-fail"); }
    }
    // 미리보기 (있으면)
    if (S.previewBtn) { try { await s.page.click(S.previewBtn); await new Promise(r=>setTimeout(r,800)); } catch {} }
    await s.shot("admin-preview");

    if (!confirm) {
      console.log("🟡 DRY-RUN: '수정'(저장) 클릭 생략. 스크린샷 확인 후 --confirm 으로 실제 반영.");
      return;
    }
    if (!S.saveBtn) { console.error("❌ 저장 셀렉터(SEL_ADMIN_SAVE) 미설정 — 실제 반영 불가."); return; }
    await s.page.click(S.saveBtn);
    await new Promise(r=>setTimeout(r,1500));
    await s.shot("admin-after-save");
    console.log("✅ 수정(저장) 클릭 완료. after 스크린샷 확인하세요.");
  } finally { await s.close(); }
})().catch((e) => { console.error("❌ apply-prompt 오류:", e.message); process.exit(1); });
