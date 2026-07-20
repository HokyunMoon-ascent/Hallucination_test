// ============================================================
// config.js — URL·셀렉터를 한 곳에 모음 (DOM 변경 취약성 격리)
// 셀렉터는 실제 페이지에서 확인 후 .env.local 로 덮어쓸 수 있음(SEL_* 키).
// ============================================================
const env = process.env;

module.exports = {
  // ── 호스트 ──
  release: {
    base: env.CEP_RELEASE_BASE || "https://release.listeningmind.com",
    cepPath: "/ko/cep",
    // 로그인 페이지 경로 (실제 확인 필요; 흔한 후보를 순서대로 시도)
    loginPaths: (env.CEP_RELEASE_LOGIN_PATHS || "/ko/login,/login,/ko/signin,/signin").split(","),
  },
  admin: {
    base: env.CEP_ADMIN_BASE || "https://admins-rele.listeningmind.com",
    promptPathPrefix: "/hubble/gpt-prompt/",
    loginPaths: (env.CEP_ADMIN_LOGIN_PATHS || "/login,/hubble/login,/signin").split(","),
  },

  // ── API (읽기) ── harvest-console.js 와 동일
  api: {
    projects: (page, perPage = 100) => `/api/labs/cep_finder/projects?page=${page}&per_page=${perPage}`,
    project: (id) => `/api/labs/cep_finder/project/${id}`,
    cookieName: "auth._token.local",
  },

  // ── 로그인 폼 셀렉터 (실제 페이지에서 확인; .env.local 로 덮어쓰기 가능) ──
  loginSelectors: {
    id: env.SEL_LOGIN_ID || 'input[type="email"], input[name="email"], input[name="username"], input[name="id"], input[type="text"]',
    pw: env.SEL_LOGIN_PW || 'input[type="password"], input[name="password"]',
    submit: env.SEL_LOGIN_SUBMIT || 'button[type="submit"], button[type="button"]',
  },

  // ── 어드민 프롬프트 폼 셀렉터 (Phase B; 실제 확인 필요) ──
  adminPromptSelectors: {
    promptTextarea: env.SEL_ADMIN_PROMPT || "textarea",
    displayPosition: env.SEL_ADMIN_DISPLAYPOS || "", // 표시위치 드롭다운 (확인 필요)
    previewBtn: env.SEL_ADMIN_PREVIEW || "",         // 미리보기
    saveBtn: env.SEL_ADMIN_SAVE || "",               // 수정
    krTab: env.SEL_ADMIN_KRTAB || "",                // KR 탭
  },

  // ── 서비스 재생성 셀렉터 (Phase C; 실제 확인 필요) ──
  cepSearchSelectors: {
    searchInput: env.SEL_CEP_SEARCH || 'input[type="search"], input[type="text"]',
    searchBtn: env.SEL_CEP_SEARCHBTN || 'button[type="submit"]',
    quotaText: env.SEL_CEP_QUOTA || "", // "N out of 20"
  },

  // ── 자격증명 (release/admin 공용 또는 분리) ──
  creds: {
    releaseId: env.CEP_RELEASE_ID || env.CEP_ID,
    releasePw: env.CEP_RELEASE_PW || env.CEP_PW,
    adminId: env.CEP_ADMIN_ID || env.CEP_ID,
    adminPw: env.CEP_ADMIN_PW || env.CEP_PW,
  },

  // ── 동작 옵션 ──
  headless: env.CEP_HEADLESS !== "false", // 기본 headless; 디버깅 시 CEP_HEADLESS=false
  // 크롬 실행 파일: CEP_CHROME_PATH > 시스템 Chrome > puppeteer 번들
  chromePath: (() => {
    const fs = require("fs");
    if (env.CEP_CHROME_PATH && fs.existsSync(env.CEP_CHROME_PATH)) return env.CEP_CHROME_PATH;
    const sys = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(sys)) return sys;
    return null; // puppeteer 기본 번들 사용
  })(),
  sessionDir: require("path").join(__dirname, "..", ".session"),
  screenshotDir: require("path").join(__dirname, "..", "screenshots"),
  outDir: require("path").join(__dirname, "..", "out"),
  reqDelayMs: Number(env.CEP_REQ_DELAY_MS || 300),
};
