# CEP 파인더 할루시네이션 검증 파이프라인

CEP 파인더의 백엔드 "검사(inspection)" 결과가 실제로 옳은지 라이브 데이터로 점검하고, 백엔드 전달용 버그/개선 리포트를 만드는 도구 모음.

## 배경

- CEP 파인더는 LLM이 만든 CEP 카드에 백엔드가 `pass/fail` 판정과 근거(`evidence`)를 붙여 내려준다.
- 프론트(`src/sections/cep/cep-cards.tsx`)는 판정을 **표시만** 하고, 판별 로직은 백엔드 소관이다.
- 그래서 "판정이 정말 맞는지"는 사람이 라이브 데이터로 대조해야 한다.

## 파이프라인 (3단계)

```
1) 크롬 익스텐션 Claude
   └ cep-verify-prompt.md 실행 (라이브 CEP 데이터 대조)
        │ 구조화된 QA 마크다운 출력
        ▼
2) 리포트 폴더의 Claude Code
   └ QA 마크다운 파싱 → cep-qa-report-template.md 채우기
        │
        ▼
3) 백엔드 전달용 리포트 (완성본)
```

## 파일

| 파일 | 용도 |
|------|------|
| `cep-verify-prompt.md` | 크롬 익스텐션 Claude에 붙여넣는 검증 프롬프트. 끝의 INPUT에 project_id/URL 기입 후 실행 |
| `cep-qa-report-template.md` | 백엔드 전달용 PM/기획 친화 리포트 템플릿 |
| `README.md` | (이 파일) 사용법 + 마크다운 스키마 규격 + 파싱 지시 |

## 사용법

1. **검증 실행**: 검증할 CEP 프로젝트 화면에 로그인한 브라우저에서, 크롬 익스텐션 Claude에 `cep-verify-prompt.md` 전문을 붙여넣고 INPUT에 project_id를 채워 실행.
2. **결과 저장**: Claude가 낸 `## CEP QA Result ...` 마크다운을 통째로 복사해 이 폴더에 `qa-raw_{project_id}.md`로 저장.
3. **리포트 생성**: 리포트 폴더의 Claude Code에게 아래 "파싱/기입 지시"대로 `qa-raw_*.md`를 읽어 `cep-qa-report-template.md`를 채우게 한다. 결과물은 `report_{project_id}.md`.

## 배치 모드 — 전체 프로젝트 순회 (37개 등)

프로젝트가 많을 때는 하나씩 열지 말고 `harvest-console.js`로 한 번에 수집한다.

**왜 필요한가 (400 원인)**: 직접 `fetch('/api/labs/cep_finder/project/{id}')`가 400 나는 건 인증 실패다. 앱 axios는 쿠키 `auth._token.local` 값을 읽어 `Authorization: Bearer <token>` 헤더를 붙인다(baseURL은 동일 오리진 `/`). 쿠키는 httpOnly가 아니라 JS로 읽을 수 있으므로, 같은 헤더만 재현하면 직접 fetch가 된다.

**순회 절차**
1. hubble에 로그인한 브라우저에서 CEP 목록/상세 페이지를 연다.
2. 개발자도구 콘솔(또는 크롬 익스텐션 실행 컨텍스트)에 `harvest-console.js` 전체를 붙여넣고 실행.
3. 스크립트가: 전체 프로젝트 목록 열거 → 완료 프로젝트(`cep_cards` 있는 것)만 상세 수집 → `cep_bundle_{N}proj_{M}cards.json` 다운로드.
4. 이 번들을 QA 단계에 투입:
   - **프로젝트별 QA**: 번들에서 프로젝트 1개 JSON을 꺼내 `cep-verify-prompt.md`에 넣어 QA 마크다운 생성 → `qa-raw_{id}.md` 저장. (LLM QA는 무거우니 프로젝트 단위로 나눠 실행/재개)
   - **집계**: 모든 `qa-raw_*.md`를 리포트 폴더 Claude Code가 합산해 통과율·CI·게이트 판정 산출.

**표본 규모 참고**: 37개 프로젝트 ≈ 370 카드로, 게이트 판정에 필요한 ~200 카드를 충분히 넘긴다. 비용을 아끼려면 **무작위 ~20개 프로젝트(~200 카드)만 QA해도** 95% CI 기준 판정이 가능하다(전량 수집은 하되 QA는 표본만).

---

## QA 마크다운 스키마 규격 (파서 계약)

크롬 익스텐션 Claude의 출력은 아래 고정 구조를 지킨다. 리포트 폴더 Claude Code는 이 규격으로 파싱한다.

- 최상단 메타 블록: `## CEP QA Result` 아래 `- key: value` 라인들 (`project_id`, `product_name`, `locale`, `checked_at`, `total_cards`).
- 카드 블록: `### Card {index} — verdict: {pass|fail|null}` 헤더. 확장 카드는 index에 `(expand)`.
- 각 카드 블록 안: `- cep: {요약}` 한 줄 + 4열 표 `| 항목 | 판정 | 근거 | 심각도 |`.
- 항목 코드: `A1~A4, B1~B4, C1~C4, D1~D3, E1~E3, F1`.
- 판정 값: `OK | 문제 | 의심 | 확인불가`. 심각도: `Critical | Major | Minor | -`.

## 파싱 / 기입 지시 (리포트 폴더 Claude Code용)

`qa-raw_*.md`를 읽고 `cep-qa-report-template.md`를 다음과 같이 채운다:

1. **헤더**: 메타 블록에서 product_name / project_id / locale / checked_at / total_cards 매핑.
2. **1. 요약 대시보드**:
   - 모든 카드 표의 행을 합산해 판정별 건수(OK/문제/의심/확인불가) 집계.
   - 심각도별로 `문제`+`의심` 행을 Critical/Major/Minor로 집계.
   - 한 줄 총평은 Critical·Major 건수 기준으로 검사 신뢰도를 판단해 작성.
3. **2. 문제 목록**: 판정이 `문제` 또는 `의심`인 행만 추출 → 카드/항목/근거(→증상)/심각도로 옮기고, 항목별로 백엔드 액션을 제안(항목 의미는 `cep-verify-prompt.md` 검증 항목 정의 참조).
4. **3. 반복 패턴**: 같은 항목 코드가 여러 카드에서 반복되면 패턴으로 묶어 개선 제안.
5. **4. 부록**: 원본 QA 마크다운 전체를 그대로 첨부.

> OK 행은 리포트 본문에 나열하지 않되 대시보드 집계에는 포함한다.
