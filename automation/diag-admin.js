// 임시 진단: 어드민 프롬프트 페이지 비로그인 상태 + 폼 구조
require("./lib/env").loadEnv();
const cfg = require("./lib/config");
const puppeteer = require("puppeteer");
const path = require("path");

const URL = process.argv[2] || "https://admins-rele.listeningmind.com/hubble/gpt-prompt/cep_finder_cep_extraction_4";
const headless = process.env.CEP_HEADLESS !== "false";

(async () => {
  const b = await puppeteer.launch({
    headless: headless ? "new" : false,
    executablePath: cfg.chromePath || undefined,
    userDataDir: path.join(cfg.sessionDir, "admin"),
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,1000"],
  });
  const p = (await b.pages())[0];
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto(URL, { waitUntil: "networkidle2", timeout: 40000 }).catch((e) => console.log("goto err:", e.message));
  console.log("최종 URL:", p.url());
  const info = await p.evaluate(() => ({
    title: document.title,
    hasTextarea: !!document.querySelector("textarea"),
    textareaLen: (document.querySelector("textarea") || { value: "" }).value.length,
    inputs: [...document.querySelectorAll("input")].map((i) => ({ type: i.type, name: i.name, ph: i.placeholder })).slice(0, 6),
    buttons: [...document.querySelectorAll("button")].map((x) => (x.textContent || "").trim()).filter(Boolean).slice(0, 12),
    google: /accounts\.google|Google/i.test(document.body.innerHTML),
  }));
  console.log(JSON.stringify(info, null, 2));
  require("fs").mkdirSync(cfg.screenshotDir, { recursive: true });
  await p.screenshot({ path: path.join(cfg.screenshotDir, "admin-diag.png"), fullPage: false });
  console.log("스크린샷: automation/screenshots/admin-diag.png");
  await b.close();
})().catch((e) => { console.error("오류:", e.message); process.exit(1); });
