#!/usr/bin/env node
// ============================================================
// compare.js — before/after 두 번들의 회귀 비교
// 사용법: node compare.js <before.json> <after.json> [--skill <스킬 scripts 경로>]
// cep-prompt-improver 의 extract_inputs.js + judge_and_aggregate.js 를 각 번들에 돌려
// warning/fail율 · 출처근거 partial · 플래그 빈도를 표로 대조.
// 읽기 전용(로컬 파일만). 로그인 불필요.
// ============================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const before = process.argv[2];
const after = process.argv[3];
if (!before || !after || before.startsWith("--")) {
  console.error("사용법: node compare.js <before.json> <after.json> [--skill <스킬 scripts 경로>]");
  process.exit(1);
}
const skillScripts = arg("--skill", path.join(os.homedir(), ".claude", "skills", "cep-prompt-improver", "scripts"));
const extract = path.join(skillScripts, "extract_inputs.js");
const judge = path.join(skillScripts, "judge_and_aggregate.js");
for (const f of [extract, judge]) {
  if (!fs.existsSync(f)) { console.error(`❌ 스킬 스크립트 없음: ${f}\n   --skill 로 경로 지정하세요.`); process.exit(1); }
}

function aggOf(bundlePath, tag) {
  if (!fs.existsSync(bundlePath)) { console.error(`❌ 번들 없음: ${bundlePath}`); process.exit(1); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cmp-${tag}-`));
  execFileSync("node", [extract, bundlePath, "--out", dir], { stdio: "ignore" });
  const out = execFileSync("node", [judge, dir], { encoding: "utf8" });
  const m = out.match(/<<<AGG_JSON>>>([\s\S]*?)<<<END>>>/);
  if (!m) { console.error(`❌ 집계 파싱 실패 (${tag})`); process.exit(1); }
  return JSON.parse(m[1]);
}

const A = aggOf(before, "before");
const B = aggOf(after, "after");

const pctMismatch = (a) => a.cards ? +((a.mismatch_total / a.cards) * 100).toFixed(1) : 0;
const partial = (a) => a.check_level.source_grounding.partial || 0;
const flag = (a, t) => { const f = (a.flags || []).find((x) => x.type === t); return f ? f.count : 0; };
const arrow = (b, a, goodDown = true) => {
  let d = a - b; if (Math.abs(d) < 1e-9) return "→ 0";
  d = Math.round(d * 10) / 10; // 소수 1자리
  const mag = Math.abs(d); const magStr = Number.isInteger(mag) ? mag : mag.toFixed(1);
  const good = goodDown ? d < 0 : d > 0;
  return `${d > 0 ? "▲+" : "▼-"}${magStr} ${good ? "✅" : "⚠️"}`;
};

const rows = [
  ["프로젝트/카드", `${A.projects}/${A.cards}`, `${B.projects}/${B.cards}`, ""],
  ["의심+실패 (건)", A.mismatch_total, B.mismatch_total, arrow(A.mismatch_total, B.mismatch_total)],
  ["의심+실패율 (%)", pctMismatch(A), pctMismatch(B), arrow(pctMismatch(A), pctMismatch(B))],
  ["출처근거 partial", partial(A), partial(B), arrow(partial(A), partial(B))],
  ["vague_expression", flag(A, "vague_expression"), flag(B, "vague_expression"), arrow(flag(A, "vague_expression"), flag(B, "vague_expression"))],
  ["no_source_quote", flag(A, "no_source_quote"), flag(B, "no_source_quote"), arrow(flag(A, "no_source_quote"), flag(B, "no_source_quote"))],
  ["fabricated_detail", flag(A, "fabricated_detail"), flag(B, "fabricated_detail"), arrow(flag(A, "fabricated_detail"), flag(B, "fabricated_detail"))],
  ["category_mismatch", flag(A, "category_mismatch"), flag(B, "category_mismatch"), arrow(flag(A, "category_mismatch"), flag(B, "category_mismatch"))],
];

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== 회귀 비교 ===`);
console.log(`before: ${path.basename(before)}`);
console.log(`after : ${path.basename(after)}\n`);
console.log(`${pad("지표", 20)}${pad("before", 12)}${pad("after", 12)}변화`);
console.log("-".repeat(56));
rows.forEach((r) => console.log(`${pad(r[0], 20)}${pad(r[1], 12)}${pad(r[2], 12)}${r[3]}`));
console.log("\n(▼ = 감소, 개선 지표는 감소가 ✅. 표본 수가 다르면 율(%)로 비교하세요.)");
