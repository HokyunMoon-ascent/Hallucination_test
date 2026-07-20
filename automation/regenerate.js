#!/usr/bin/env node
// ============================================================
// regenerate.js — [Phase C · 게이트] 서비스에서 키워드로 CEP 재생성
// 사용법:
//   node regenerate.js --keywords "매트리스,선크림" [--confirm]
// 기본 DRY-RUN: 로그인 → /ko/cep 이동 → 쿼터("N out of 20") 확인 → 스크린샷까지만.
//   `--confirm` 이 있어야 실제로 검색창 입력→검색(프로젝트 생성)을 실행.
// ⚠ 프로덕션 생성 + 쿼터(20) 소모. 셀렉터는 실제 페이지에서 검증 필요.
// ============================================================
require("./lib/env").requireEnv([]);
const cfg = require("./lib/config");
const { openSession } = require("./lib/session");

function arg(name, def = null) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const keywords = (arg("--keywords", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const confirm = process.argv.includes("--confirm");
if (!keywords.length) { console.error('사용법: node regenerate.js --keywords "kw1,kw2" [--confirm]'); process.exit(1); }
const S = cfg.cepSearchSelectors;

(async () => {
  const s = await openSession({ host: "release" });
  try {
    await s.page.goto(cfg.release.base + cfg.release.cepPath, { waitUntil: "networkidle2", timeout: 40000 });
    await s.shot("cep-before");

    // 쿼터 확인 ("N out of 20")
    let quota = "";
    try {
      quota = await s.page.evaluate(() => {
        const m = document.body.innerText.match(/(\d+)\s*out of\s*(\d+)/i);
        return m ? m[0] : "";
      });
    } catch {}
    if (quota) {
      console.log(`ℹ️  프로젝트 쿼터: ${quota}`);
      const m = quota.match(/(\d+)\s*out of\s*(\d+)/i);
      if (m && Number(m[1]) >= Number(m[2])) {
        console.error(`❌ 쿼터 소진(${quota}). 재생성 전 오래된 프로젝트 삭제가 필요합니다(사용자 승인).`);
        console.error(`   ${keywords.length}개 키워드 생성 불가. 중단.`);
        return;
      }
    } else {
      console.log("⚠ 쿼터 표시를 못 찾음(SEL_CEP_QUOTA 확인). 진행 시 주의.");
    }

    if (!confirm) {
      console.log(`🟡 DRY-RUN: 실제 검색/생성 생략. 대상 키워드: ${keywords.join(", ")}`);
      console.log(`   실제 생성하려면 --confirm (프로덕션 생성 + 쿼터 소모).`);
      return;
    }

    for (const kw of keywords) {
      console.log(`▶ 생성: ${kw}`);
      try {
        const input = await s.page.$(S.searchInput);
        if (!input) { console.error(`  ❌ 검색창 셀렉터 미탐(SEL_CEP_SEARCH). 중단.`); break; }
        await input.click({ clickCount: 3 });
        await input.type(kw, { delay: 30 });
        const btn = await s.page.$(S.searchBtn);
        if (btn) await btn.click(); else await input.press("Enter");
        await new Promise((r) => setTimeout(r, 3000)); // 생성 시작 대기(폴링은 추후 보강)
        await s.shot(`cep-created-${kw}`);
      } catch (e) { console.error(`  실패(${kw}):`, e.message); await s.shot(`cep-fail-${kw}`); }
    }
    console.log("✅ 재생성 요청 완료. 생성 완료 후 `node harvest.js --since <오늘>` 로 수집하세요.");
  } finally { await s.close(); }
})().catch((e) => { console.error("❌ regenerate 오류:", e.message); process.exit(1); });
