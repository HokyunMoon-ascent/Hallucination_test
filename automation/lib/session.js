// ============================================================
// session.js — Puppeteer 로그인 + auth 토큰 확보
// - userDataDir 로 세션 재사용(가능하면 로그인 스킵)
// - 로그인 폼 자동 입력(ID/PW). 성공 후 auth._token.local 쿠키 추출.
// - 실패 시 screenshots/ 에 스냅샷 남기고 명확한 에러.
// SSO/2FA 도입 시: CEP_HEADLESS=false 로 띄워 사람이 로그인 → 세션 재사용(반자동).
// ============================================================
const fs = require("fs");
const path = require("path");
const cfg = require("./config");

let _puppeteer = null;
function puppeteer() {
  if (_puppeteer) return _puppeteer;
  try { _puppeteer = require("puppeteer"); }
  catch (e) {
    console.error("❌ puppeteer 미설치. automation/ 에서 `npm install` 하세요.");
    process.exit(1);
  }
  return _puppeteer;
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

async function shot(page, name) {
  try {
    ensureDir(cfg.screenshotDir);
    const p = path.join(cfg.screenshotDir, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: true });
    console.error(`   🖼  스크린샷: ${p}`);
  } catch {}
}

async function getAuthCookie(page, host) {
  const cookies = await page.cookies(host);
  return cookies.find((c) => c.name === cfg.api.cookieName) || null;
}

// host: "release" | "admin"
async function openSession({ host = "release", forceLogin = false } = {}) {
  const conf = cfg[host];
  const id = host === "admin" ? cfg.creds.adminId : cfg.creds.releaseId;
  const pw = host === "admin" ? cfg.creds.adminPw : cfg.creds.releasePw;
  if (!id || !pw) {
    console.error(`❌ ${host} 자격증명 없음(CEP_${host.toUpperCase()}_ID/PW 또는 CEP_ID/PW).`);
    process.exit(1);
  }

  ensureDir(cfg.sessionDir);
  const launchOpts = {
    headless: cfg.headless ? "new" : false,
    userDataDir: path.join(cfg.sessionDir, host),
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"],
  };
  if (cfg.chromePath) launchOpts.executablePath = cfg.chromePath;
  const browser = await puppeteer().launch(launchOpts);
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ width: 1280, height: 900 });

  // 1) 세션 재사용 시도: cep 페이지 열어 토큰 쿠키 확인
  const homeUrl = conf.base + (host === "release" ? cfg.release.cepPath : conf.promptPathPrefix.replace(/\/$/, ""));
  try { await page.goto(homeUrl, { waitUntil: "networkidle2", timeout: 30000 }); } catch {}
  let cookie = await getAuthCookie(page, conf.base);
  if (cookie && !forceLogin) {
    console.log(`✓ ${host} 기존 세션 재사용`);
    return finalize(browser, page, cookie, conf.base);
  }

  // 2) 로그인 폼 시도
  let loggedIn = false;
  for (const lp of conf.loginPaths) {
    const url = conf.base + lp.trim();
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch { continue; }
    const idEl = await page.$(cfg.loginSelectors.id);
    const pwEl = await page.$(cfg.loginSelectors.pw);
    if (!idEl || !pwEl) continue; // 이 경로는 로그인 폼 아님
    try {
      await idEl.click({ clickCount: 3 }); await idEl.type(id, { delay: 20 });
      await pwEl.type(pw, { delay: 20 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
        (async () => {
          // "로그인" 텍스트 버튼 우선(소셜/문의 버튼 오클릭 방지), 없으면 셀렉터/Enter
          const byText = await page.evaluateHandle(() => {
            const btns = [...document.querySelectorAll("button")];
            return btns.find((b) => (b.textContent || "").trim() === "로그인") || null;
          });
          const el = byText && byText.asElement ? byText.asElement() : null;
          if (el) await el.click();
          else { const btn = await page.$(cfg.loginSelectors.submit); if (btn) await btn.click(); else await pwEl.press("Enter"); }
        })(),
      ]);
      // 로그인 직후 토큰 세팅에 약간의 지연이 있을 수 있어 잠깐 대기
      await new Promise((r) => setTimeout(r, 1500));

      // 단일 세션 계정: "다른 기기에서 사용 중" 모달 → 기존 세션 강제 로그아웃 확인
      const modal = await page.evaluate(() => /다른 기기에서 사용 중|기존 사용을 종료/.test(document.body.innerText || ""));
      if (modal) {
        if (process.env.CEP_FORCE_LOGIN !== "true") {
          await shot(page, `login-singlesession-${host}`);
          console.error(`⚠ 단일 세션 계정: 이 계정이 다른 기기에서 사용 중입니다.`);
          console.error(`   지금 로그인하면 기존 세션(브라우저에서 쓰던 로그인)이 자동 로그아웃됩니다.`);
          console.error(`   강제로 진행하려면 CEP_FORCE_LOGIN=true 로 재실행하세요.`);
          console.error(`   (권장: 자동화 전용 계정을 별도로 두면 서로 로그아웃 충돌이 없습니다.)`);
          await browser.close();
          process.exit(2);
        }
        // 확인: 모달 내 '로그인'(마지막) 버튼 클릭
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
          page.evaluate(() => {
            const btns = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "로그인");
            const t = btns[btns.length - 1]; if (t) t.click();
          }),
        ]);
        await new Promise((r) => setTimeout(r, 1500));
      }

      cookie = await getAuthCookie(page, conf.base);
      if (cookie) { loggedIn = true; break; }
    } catch (e) {
      console.error(`   로그인 시도 실패(${url}): ${e.message}`);
    }
  }

  if (!loggedIn) {
    await shot(page, `login-fail-${host}`);
    console.error(`❌ ${host} 로그인 실패. 셀렉터/로그인 경로를 확인하세요.`);
    console.error(`   .env.local 로 조정: CEP_${host.toUpperCase()}_LOGIN_PATHS, SEL_LOGIN_ID/PW/SUBMIT`);
    console.error(`   또는 CEP_HEADLESS=false 로 띄워 사람이 로그인 후 재실행(세션 재사용).`);
    await browser.close();
    process.exit(1);
  }
  console.log(`✓ ${host} 로그인 성공`);
  return finalize(browser, page, cookie, conf.base);
}

function finalize(browser, page, cookie, base) {
  const raw = decodeURIComponent(cookie.value || "");
  const bearer = raw.startsWith("Bearer ") ? raw : "Bearer " + raw;
  return {
    browser, page, base,
    token: bearer,
    // 세션 내 fetch 용 헤더
    apiHeaders: { Authorization: bearer, "Content-Type": "application/json", "Accept-Language": "ko-KR" },
    async close() { try { await browser.close(); } catch {} },
    shot: (name) => shot(page, name),
  };
}

module.exports = { openSession, shot };
