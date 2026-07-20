# CEP Phase 프롬프트 자가 개선 리포트 — 2026-07-16

입력 번들: `cep_bundle_14proj_140cards_since2026-07-14.json` (프로젝트 14 · 카드 140 · 전부 2026-07-15 생성·검수 완료)
스킬: `cep-prompt-improver`

## 1. 총체 집계

| 지표 | 값 |
|---|---|
| 판정 | pass 102 · **warning 34 · fail 4** |
| 의심+실패 | 38카드 (27.1%) |
| 의심/실패 카드의 **카테고리 적합** | ok 37 · partial 1 · fail 0 → **거의 문제 없음** |
| 의심/실패 카드의 **출처 근거** | ok 7 · **partial 30** · fail 1 → **여기가 병목** |

플래그 빈도(반복 프로젝트 수):

| 플래그 | 건수 | 반복 프로젝트 |
|---|---|---|
| vague_expression | 25 | 13 |
| no_source_quote | 8 | 7 |
| category_mismatch | 3 | 3 |
| fabricated_detail | 1 | 1 |
| redundant | 1 | 1 |

**결론:** 카테고리 이탈이 아니라 **출처 근거의 정밀도** 문제. 특히 '구매 전환 결론'을 인용에 못 묶는 것(vague/no_source_quote)이 지배적.

## 2. 반복 실패 유형 → 채택/제외 (과적합 방지: 2개 이상 프로젝트만 채택)

| 실패 유형 | 반복성 | 채택 | 대상 phase |
|---|---|---|---|
| 결론부 비약(없는 행동) | no_source_quote 7proj | ✅ | Phase 4 |
| 구체→모호 일반화 | vague 13proj (지배적) | ✅ | Phase 3 + 4 |
| 인과·강도 과단정 | 3proj | ✅ | Phase 4 |
| 없는 디테일 추가 | 다수(vague형) | ✅ | Phase 4 |
| 질문→단정 서술 | 2proj | ✅ | Phase 3 + 4 |
| 범위 확장/카테고리 초점 이탈 | 3proj | ✅(경량) | Phase 3 |
| 근거 중복(redundant) | 1proj | ❌ 과적합 방지 | (재제안까지만) |
| fabricated 단독 | 1proj | ❌ '없는 디테일' 규칙에 흡수 | — |
| KBF(Phase 5) / 예시질문(Phase 5-1) | 신호 없음 | — | 이번 회차 변경 없음 |

## 3. 생성한 프롬프트 개선 초안 (원본 불변 · `미확정)` 새 버전)

- **Phase 4** → `phase4_…/KR/미확정) v.1.2.0_ CEP Trigger Extraction …_KR_0716.md`
  - 베이스: 기존 `미확정) v.1.1.0`(Grounded) 위에 보강.
  - 추가 4규칙: ①전환 결론절 그라운딩 ②구체어 보존(상위어 치환 금지) ③강도·인과 보존(과단정 금지) ④질문형 보존.
- **Phase 3** → `phase3_…/KR/미확정) v.1.1.0_ CEP Insight Research …_KR_0716.md`
  - 베이스: `v.1.0.0`.
  - 추가 3규칙: ①구체어 원문 보존 ②질문형 보존 ③초점 범위 유지 + (근거 중복 방지 문구).
- 각 초안 상단에 "v현행 대비 변경점" 표 + 근거(프로젝트·실패유형·반복 수) 명시.
- **로케일:** KR만. JP/EN은 동일 취지 수동 반영 필요.

## 4. 검수 산출물 (비매칭 포인트 + 본문 기반 재제안)

`cep-improve-260716/repropose/1329~1342.json` (14개). mismatch seq는 입력 warning/fail과 100% 일치. (대시보드 `repropose/`와 동일 산출물 재사용.)

## 5. 회귀 측정 안내 (자동 아님 — 외부 파이프라인)

1. 위 `미확정)` 초안을 검토·승인.
2. 개발팀이 Phase 3/4에 반영(+ JP/EN 동기화, 필요 시 Phase 3.5 증거 유닛 연계).
3. 동일 키워드로 CEP 재생성 → `harvest-console.js`로 재수집(검수 포함).
4. **본 스킬을 새 번들에 재실행** → `warning/fail율`·`출처근거 partial 비율`·`vague_expression 빈도`를 이번 수치와 전후 비교.
   - 목표: partial 비율↓, no_source_quote↓, 의심+실패율 27.1% → 하락.
