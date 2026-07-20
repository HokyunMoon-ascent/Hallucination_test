#!/usr/bin/env node
// ============================================================
// bootstrap-admin.js — 어드민(Google SSO) 반자동 로그인 부트스트랩
// 사용법: node bootstrap-admin.js [<어드민 프롬프트 URL>]
// 동작: 화면에 Chrome을 띄움 → 사용자가 구글 계정으로 직접 로그인 →
//       로그인 감지되면 세션을 .session/admin 에 저장하고 종료.
// 이후 apply-prompt.js 등이 이 세션을 헤드리스로 재사용한다.
// 최대 5분 대기.
// ============================================================
require("./lib/env").loadEnv();
const path = require("path");
const fs = require("fs");
const cfg = require("./lib/config");
const puppeteer = require("puppeteer");

const URL = process.argv[2] || (cfg.admin.base + cfg.admin.promptPathPrefix + "cep_finder_cep_extraction_4");

(async () => {
  console.log("🔓 어드민 로그인 부트스트랩 — 브라우저 창이 뜨면 구글 계정으로 로그인해 주세요.");
  const browser = await puppeteer.launch({
    headless: false, // 반드시 화면 표시 (사람이 구글 로그인)
    executablePath: cfg.chromePath || undefined,
    userDataDir: path.join(cfg.sessionDir, "admin"),
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,1000"],
    defaultViewport: null,
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 40000 }).catch(() => {});

  const deadline = Date.now() + 5 * 60 * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    let url = "";
    try { url = page.url(); } catch { break; } // 창을 닫았으면 종료
    if (url.includes("/login") || url.includes("accounts.google")) continue; // 아직 로그인 중
    // 로그인된 것으로 보이면 프롬프트 페이지로 이동해 폼 확인
    if (!url.includes("/hubble/gpt-prompt/")) {
      await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }
    const has = await page.evaluate(() => !!document.querySelector("textarea")).catch(() => false);
    if (has && !page.url().includes("/login")) { ok = true; break; }
  }

  if (ok) {
    fs.mkdirSync(cfg.screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(cfg.screenshotDir, "admin-bootstrap-ok.png"), fullPage: false }).catch(() => {});
    console.log("✅ 어드민 로그인 확인 — 세션이 저장됐습니다(.session/admin). 이제 apply-prompt.js 를 사용할 수 있습니다.");
  } else {
    console.error("❌ 5분 내 로그인 확인 실패(또는 창 닫힘). 다시 실행해 주세요.");
  }
  await browser.close().catch(() => {});
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("오류:", e.message); process.exit(1); });
