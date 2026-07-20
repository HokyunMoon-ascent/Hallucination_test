#!/usr/bin/env node
// ============================================================
// harvest.js — release 로그인 후 CEP 완료 프로젝트 JSON 번들 자동 확보
// 사용법:
//   node harvest.js [--since YYYY-MM-DD] [--out <파일경로>]
// harvest-console.js 와 동일 로직을 로그인된 세션(page 컨텍스트)에서 실행.
// 읽기 전용. 산출물: out/cep_bundle_<n>proj_<c>cards[_since<date>].json
// ============================================================
require("./lib/env").requireEnv([]); // .env.local 로드 (creds는 session이 검사)
const fs = require("fs");
const path = require("path");
const cfg = require("./lib/config");
const { openSession } = require("./lib/session");

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// page 컨텍스트에서 실행 (release origin) — harvest-console.js 로직
async function harvestInPage(since) {
  const raw = (document.cookie.match(/(?:^|;\s*)auth\._token\.local=([^;]*)/) || [])[1] || "";
  const tok = decodeURIComponent(raw);
  if (!tok) return { error: "auth._token.local 쿠키 없음 (로그인 안 됨)" };
  const authz = tok.startsWith("Bearer ") ? tok : "Bearer " + tok;
  const H = { Authorization: authz, "Content-Type": "application/json", "Accept-Language": "ko-KR" };
  const api = (p) => fetch(p, { headers: H, credentials: "include" }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status} ${p}`)));

  let rows = [], page = 1;
  while (true) {
    const res = await api(`/api/labs/cep_finder/projects?page=${page}&per_page=100`);
    const batch = (res.result && res.result.rows) || [];
    rows = rows.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  const out = [], skipped = [];
  for (const r of rows) {
    try {
      const d = await api(`/api/labs/cep_finder/project/${r.id}`);
      const detail = d.result;
      if (!detail || !detail.cep_cards || !detail.cep_cards.length) { skipped.push(`${r.id} (미완료/카드없음)`); continue; }
      if (since) {
        const ct = (detail.created_time || "").slice(0, 10);
        if (ct && ct < since) { skipped.push(`${r.id} (${ct} < ${since})`); continue; }
      }
      out.push(detail);
      await new Promise((s) => setTimeout(s, 300));
    } catch (e) { skipped.push(`${r.id} (err ${e})`); }
  }
  const totalCards = out.reduce((n, p) => n + ((p.cep_cards && p.cep_cards.length) || 0), 0);
  return { harvested_projects: out.length, total_cards: totalCards, projects: out, skipped };
}

(async () => {
  const since = arg("--since", "");
  const s = await openSession({ host: "release" });
  try {
    // release origin 에서 실행되도록 cep 페이지 보장
    await s.page.goto(cfg.release.base + cfg.release.cepPath, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    console.log(`⏳ 하베스트 시작${since ? ` (since ${since})` : ""}…`);
    const bundle = await s.page.evaluate(harvestInPage, since);
    if (bundle.error) { console.error("❌ " + bundle.error); await s.shot("harvest-fail"); process.exit(1); }

    fs.mkdirSync(cfg.outDir, { recursive: true });
    const outArg = arg("--out");
    const fname = outArg || `cep_bundle_${bundle.harvested_projects}proj_${bundle.total_cards}cards${since ? `_since${since}` : ""}.json`;
    const outPath = path.isAbsolute(fname) ? fname : path.join(cfg.outDir, fname);
    const payload = { harvested_projects: bundle.harvested_projects, total_cards: bundle.total_cards, projects: bundle.projects };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

    console.log(`✅ 수집 완료: ${bundle.harvested_projects}개 프로젝트 / ${bundle.total_cards} 카드`);
    if (bundle.skipped && bundle.skipped.length) console.log(`⏭  제외 ${bundle.skipped.length}개`);
    console.log(`⬇️  저장: ${outPath}`);
  } finally {
    await s.close();
  }
})().catch((e) => { console.error("❌ harvest 오류:", e.message); process.exit(1); });
