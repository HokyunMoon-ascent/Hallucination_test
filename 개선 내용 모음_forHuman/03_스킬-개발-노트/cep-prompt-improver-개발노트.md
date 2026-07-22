# 다음 스킬을 생성합니다. (07/16)

## 스킬의 목적: CEP Phase 프롬프트 자가 개선

## How

1. 사용자가 추가한 CEP 파인더 검증 결과 json을 확인한다.
2. 해당 프로젝트에서 의심·실패 카드를 판정한다.
3. 그 판정을 바탕으로 검수 작업(비매칭 포인트, 본문 기반 CEP 재제안)을 한다.
4. 검수를 마치면 '/Users/ascentkorea/Library/CloudStorage/GoogleDrive-hokyun.moon@ascentnet.co.jp/내 드라이브/workspace_ascent/202601_aiAgent/promptMarkdown/agents/ai_agent/CEP_Phase'의 프롬프트 중 다음을 개선한다.

- phase3\_ CEP Insight Research (소비자 맥락 조사)
- phase4\_ CEP Trigger Extraction (CEP 상황, 나노인텐트 생성)
- phase5\_ KBF Generation (핵심 구매 요인 도출)
- phase5-1\_ KBF User Prompts (AI 챗봇 예시 질문 생성)

---

# Phase 4 CEP 문장 개선 프로세스 추가 요청 (07/21)

Why?: 생성된 CEP 문장이 실제 CEP 베스트 사례와 차이가 난다.
How?
/cep-prompt-improver 스킬에 다음 단계를 추가한다.

1. 생성된 CEP가 적절한 표현을 쓰고 있는지 노트북 LM에 질의한다.
2. 노트북 LM에는 다음과 같이 질의한다.

```
URL의 내용(실제 응답 생성에 사용된 출처 URL 내 본문 제시)에 근거하여, 'CEP1~10(전부 제시)'를 작성했습니다. 현재 노트북에 기반하여 방법론에 맞는 수정안을 제시해 주세요. 어떤 방식으로 다음과 같이 수정안을 만들었는지도 제시해 주세요.
```

3. 돌아온 응답으로 방법론을 파악했다면 Phase 4를 강화합니다.

---

# 의미 치환(paraphrase) 동일 = pass 재판정 기준 (07/21)

Why?: phase3/4/5 프롬프트를 개선하며 "기존 CEP 형식"에 맞추다 보니, 출처 URL 원문을 **날 것 그대로 인용하지 않고
의미만 보존한 채 치환(paraphrase)**하도록 바뀌었다(원문을 그대로 쓰면 부적절한 표현이 나올 수 있어서다).
그러자 검수기(LLM inspection)가 축자 인용과 `source_section_ids`가 없다는 이유로 `source_grounding=fail·partial`,
`no_source_quote` 할루시네이션 플래그를 걸었고, pass율이 떨어졌다. 하지만 이건 **표현 방식의 문제일 뿐 근거의 문제가 아니다.**

How?

- **판정 원칙**: CEP 문장이 `research.result_data.content`(실제 응답 생성에 쓰인 출처 본문)의 특정 불릿과
  **의미가 같고(근거됨)** 입력 카테고리에도 맞으면, **축자 인용이나 `source_section_ids`가 없다는 이유만으로 강등하지 않고
  pass로 둔다**.
- **근거 확인 위치**: 카드의 `evidence.quotes`가 비어 있더라도 `research.result_data.content` 본문에서 대응하는 불릿을
  찾아 대조한다(생성 단계에서 인용 링크만 빠졌을 뿐 본문에는 근거가 남아 있는 경우가 많다).
- **승격하지 않는 예외**:
  1. **카테고리 이탈** — 본문에는 있으나 입력 카테고리를 벗어난 경우(예: 가정용 공기청정기 프로젝트의 "차량 공기청정기").
  2. **본문에 없는 주장 추가** — paraphrase가 아니라 출처에 없는 특정 정보를 덧붙인 경우(예: 개인 후기 글에 근거 없이 "가족"을 특정).
  3. **진짜 날조** — 본문 어디에도 대응 근거가 없는 경우.
- **반영 방법(대시보드)**: 원본 bundle은 건드리지 않고 **별도 오버라이드 레이어** `semantic-overrides.json`
  (`{project_id: [{cardId, from, to:"pass", rule:"SEMANTIC_EQUIVALENCE", note, quote, url, sec}]}`)에 승격한 카드를 기록한다.
  `gen-dashboard-data.js`가 이 파일을 읽어 rows·detail·diag 판정을 pass로 덮어쓰고(원 verdict는 override로 함께 표기),
  diag 요약(P/W/F)은 오버라이드를 반영한 뒤 카드 verdict에서 다시 계산한다. 원래 검수 코멘트는 "재판정 이전 기준" 배너로 남겨 둔다.
- **최초 적용 범위**: 1374·1375·1376(이후로는 신규 프로젝트에도 같은 기준을 그대로 적용).
