# CEP 자가개선 루프 자동화 (Headless Chrome)

`cep-prompt-improver` 스킬과 연결되는 브라우저 자동화. **Phase A(읽기+비교)** 가 구축 완료, **Phase B/C(어드민 반영·재생성)** 는 `--confirm` 게이트 뒤 설계본.

## 설치
```bash
cd automation
npm install                 # puppeteer 설치(크롬 포함)
cp .env.local.example .env.local
# .env.local 에 CEP_ID / CEP_PW 입력 (gitignored)
```

## Phase A — 읽기+비교 (안전, 지금 사용 가능)

### JSON 자동 확보 (harvest-console.js 자동화)
```bash
node harvest.js --since 2026-07-14        # 해당 날짜 이후 완료 프로젝트만
node harvest.js                            # 전체
# → out/cep_bundle_<n>proj_<c>cards[_since<date>].json
```
- 로그인 → 세션 재사용(.session/) → API 순회 → 번들 저장. **읽기 전용.**

### 회귀 비교 (before/after)
```bash
node compare.js <before.json> <after.json>
# 예: node compare.js ../description/cep_bundle_21proj_210cards.json out/cep_bundle_..._new.json
```
- `cep-prompt-improver` 집계로 warning/fail율·출처근거 partial·플래그 빈도 대조.
- 스킬 경로가 다르면 `--skill <경로>`.

## Phase B — 어드민 프롬프트 반영 (게이트, 프로덕션 쓰기 ⚠)
```bash
# DRY-RUN (기본): 로그인→페이지 이동→기존값 백업→새값 입력→미리보기 스크린샷까지만
node apply-prompt.js --url "https://admins-rele.listeningmind.com/hubble/gpt-prompt/cep_finder_product_research_3" \
                     --file "<개선안 md 경로>"
# 실제 저장(‘수정’ 클릭): --confirm 추가 + 사람 승인
node apply-prompt.js --url "..." --file "..." --confirm
```
- **실제 반영 전 셀렉터 확정 필요**: `.env.local` 의 `SEL_ADMIN_PROMPT/SEL_ADMIN_SAVE/SEL_ADMIN_PREVIEW/SEL_ADMIN_DISPLAYPOS`.
- 기존 프롬프트는 `out/prompt-backup-*.md` 로 백업됨.

## Phase C — 재생성 트리거 (게이트, 프로덕션 생성 + 쿼터 ⚠)
```bash
node regenerate.js --keywords "매트리스,선크림"           # DRY-RUN(쿼터 확인만)
node regenerate.js --keywords "매트리스,선크림" --confirm  # 실제 생성
```
- **쿼터 "N out of 20"** 확인 후 초과 시 중단. 실제 생성 후 `harvest.js` 로 수집.

## 전체 루프 (B·C 활성화 시)
개선안 승인 → `apply-prompt.js --confirm` → `regenerate.js --confirm` → 생성 완료 대기 → `harvest.js` → `cep-prompt-improver` 재실행 → `compare.js`.

## 보안·주의
- **자격증명은 `automation/.env.local` (gitignored).** 커밋·로그 노출 금지. `.session/` 도 gitignore.
- **프로덕션 쓰기(B/C)는 기본 비활성.** `--confirm` + 사람 승인 필수. 쿼터(20) 소모 주의.
- 실패 시 `screenshots/` 에 스냅샷. 어드민/서비스 DOM 변경 시 `.env.local` 셀렉터로 대응.
- 2FA/SSO 도입 시: `CEP_HEADLESS=false` 로 사람이 로그인 → 세션 재사용(반자동).
