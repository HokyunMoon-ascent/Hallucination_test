// ============================================================
// env.js — .env.local 로더 (외부 의존 없음)
// automation/.env.local 를 우선 로드하고, 없으면 리포 루트 .env.local 시도.
// 이미 process.env 에 있으면 덮어쓰지 않음.
// ============================================================
const fs = require("fs");
const path = require("path");

function parseEnv(text) {
  const out = {};
  text.split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.startsWith("#")) return;
    const eq = s.indexOf("=");
    if (eq === -1) return;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  });
  return out;
}

function loadEnv() {
  const candidates = [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", "..", ".env.local"),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      const parsed = parseEnv(fs.readFileSync(f, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    }
  }
  return process.env;
}

// 필수 키 확인 (없으면 명확한 에러)
function requireEnv(keys) {
  loadEnv();
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ 필수 환경변수 누락: ${missing.join(", ")}`);
    console.error(`   automation/.env.local 에 설정하세요 (automation/.env.local.example 참고).`);
    process.exit(1);
  }
  return process.env;
}

module.exports = { loadEnv, requireEnv, parseEnv };
