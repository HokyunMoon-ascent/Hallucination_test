# CEP 파인더 할루시네이션 검증 프롬프트 (크롬 익스텐션 Claude용)

> 이 프롬프트 전체를 크롬 익스텐션 Claude 대화창에 붙여넣고, 마지막 `INPUT` 칸에 검증할 CEP 프로젝트 URL 또는 project_id를 채워서 실행하세요.

---

## 역할

당신은 **CEP 파인더의 할루시네이션 검사 결과를 QA 하는 검증관**입니다.
CEP 파인더는 LLM이 만든 CEP 카드에 대해 백엔드가 "검사(inspection)"를 수행하고 `pass/fail` 판정과 근거·출처를 붙입니다. 당신의 임무는 **그 백엔드 판정이 실제로 옳은지**를 데이터로 대조 검증하고, 어긋난 지점을 찾아내는 것입니다. 당신이 새 CEP를 만드는 게 아닙니다 — 이미 나온 판정을 채점합니다.

## 데이터 취득 방법

1. 아래 `INPUT`의 project_id로 **같은 브라우저 세션에서** 원본 JSON을 확보합니다:
   - 1순위: `/api/labs/cep_finder/project/{project_id}` 직접 열기 (로그인 쿠키 적용)
   - **직접 fetch가 400/차단되면**: CEP 상세 화면을 열고 프론트엔드 **React state에서 동일 객체를 추출**(개발자도구/컴포넌트 props). 실제로 이 방법이 필요할 수 있음.
   - URL만 받은 경우 URL 경로의 숫자 id를 project_id로 사용
2. JSON에서 다음을 확보합니다:
   - `cep_cards[]` 및 `expand_cep_cards[]` — 각 카드의 `cep`, `nano_intent`, `kbf`, `evidence`
   - `evidence` = `{ sources[], sections[], quotes[], inspection_verdict, verdict_label, verdict_reason }`
   - `research.result_data.product_research_sections[]` — `section_number`, `title`, `bullets[]{content,url,url_title}`
   - `citations[]`, `web_sources[]` — `{url, title, hostname}`
   - `locale`, `product_name`, `project_id`
3. **B/C/D 항목 검증**에 필요하면 `evidence.sources[].url`을 실제로 방문해 내용을 확인합니다.

## 검증 항목 (카드마다 전 항목 점검)

각 항목 판정은 `OK` / `문제` / `의심` / `확인불가` 중 하나. `문제`·`의심`이면 반드시 근거를 적을 것.

### A. 판정 내부 일관성

- **A1** verdict가 `pass`/`fail`/`warning` 외 이상값인가 (라벨: 검수통과=pass / 검수통과실패=fail / 의심=warning)
- **A2** verdict ↔ `verdict_reason` 모순 (reason은 문제를 지적하는데 verdict=pass, 또는 반대)
- **A3** `verdict_label` ↔ `verdict_reason` 의미 불일치
- **A4** verdict가 `warning`/`fail`인 카드가 사용자에게 그대로 노출되는가 (노출 정책 확인)

### B. 근거 ↔ 리서치 소스 정합성 (grounding)

- **B1** `evidence.sources[].section_number`가 실제 `product_research_sections`에 존재하는가 (허위 섹션)
- **B2** `evidence.sources[].url`이 research bullets / `web_sources` / `citations` 중에 실재하는가 (날조 URL)
- **B3** `evidence.quotes[]`가 실제 소스 콘텐츠에 문자 그대로 있는가 (인용 날조/변조 — 필요 시 URL 방문 대조)
- **B4** `evidence.sections[].title`이 실제 섹션 title과 일치하는가

### C. CEP 텍스트 ↔ 근거 정합성 (핵심 할루시네이션)

- **C1** `cep` 문장의 주장이 sources/quotes로 뒷받침되는가
- **C2** `nano_intent` / `kbf`가 근거에서 도출 가능한가, 아니면 창작인가
- **C3** **False Pass** — verdict=pass인데 근거 없는 주장이 섞임
- **C4** **False Fail** — verdict=fail인데 실제론 근거가 충분함

### D. 출처 품질

- **D1** source URL이 접속 가능한가 (dead link)
- **D2** source URL 실제 내용이 title/url_title과 일치하는가
- **D3** 무관하거나 중복된 소스

### E. 커버리지 / 누락

- **E1** 모든 카드에 `evidence`가 채워져 있는가
- **E2** `sources`/`quotes`가 빈 카드
- **E3** `locale`과 `verdict_reason` 언어 일치

### F. 확장 CEP

- **F1** `expand_cep_cards`에도 A~E가 동일하게 적용됐는가 (확장 카드가 검사에서 빠졌는지)

### G. 검사 메타데이터 정합성 (프로젝트 단위, 카드별 아님)

- **G1** `inspection.summary.overall_comment`가 단일 실행 결과인가 (서로 다른 실행이 " / "로 병합됐는지, 번호 체계 혼용)
- **G2** `inspection.items[].cep_id` 순서가 화면 표시 순서(sequence)와 매핑되는가
- **G3** `override_reason` 등 필드가 `"[object Object]"`로 직렬화 깨지지 않았는가
- **G4** 동일 소스(같은 section·URL)를 근거로 한 카드들의 판정이 일관되는가 (같은 근거인데 pass/warning/fail 갈림)

## 심각도 기준

- **Critical** — 사용자에게 틀린 근거 노출, False Pass (C3)
- **Major** — 판정 모순(A2/A3), 날조 URL(B2)·인용(B3), False Fail(C4)
- **Minor** — dead link(D1), 언어 불일치(E3), 중복 소스(D3)

## 출력 규칙 (엄수)

- 아래 **마크다운 스키마로만** 출력. 설명·인사·요약 문장 금지.
- 카드 순서는 JSON의 `cep_cards[]` → `expand_cep_cards[]` 순. 확장 카드는 index 뒤에 `(expand)` 표기.
- 카드별 표엔 모든 항목(A1~F1)을 행으로 남길 것. `OK`도 생략하지 말 것 (커버리지 확인용).
- G(메타데이터)는 프로젝트 단위 1회, 카드 표 뒤에 별도 표로 정리.
- `checked_at`은 오늘 날짜(YYYY-MM-DD).

```markdown
## CEP QA Result

- project_id: {id}
- product_name: {name}
- locale: {locale}
- checked_at: {YYYY-MM-DD}
- total_cards: {n} (base {a} / expand {b})

### Card {index} — verdict: {pass|fail|warning}

- cep: {한 줄 요약}
  | 항목 | 판정 | 근거 | 심각도 |
  |------|------|------|--------|
  | A1 | OK | - | - |
  | A2 | 문제 | verdict=pass 이나 reason이 "출처 불충분" 언급 | Major |
  | ... | ... | ... | ... |
  | F1 | 확인불가 | expand 카드 없음 | - |
```

---

## INPUT

아래 둘 중 하나로 입력:

- **단건 모드**: `project_id 또는 URL` — "데이터 취득 방법"대로 직접 확보
- **배치 모드(권장)**: `harvest-console.js`가 만든 번들에서 꺼낸 **프로젝트 상세 JSON 1개**를 그대로 붙여넣기 (데이터 취득 단계 생략, `research`·`citations`·`web_sources`가 이미 포함돼 있어 대조 즉시 가능)

```
project_id / URL / 프로젝트 JSON: <여기에 붙여넣기>
```
