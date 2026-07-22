// ============================================================
// CEP 전체 프로젝트 하베스트 스크립트
// 사용법: hubble에 로그인한 브라우저에서 CEP 페이지를 연 뒤,
//        개발자도구 콘솔(또는 크롬 익스텐션 실행 컨텍스트)에 이 코드를 붙여넣고 실행.
// 결과: 완료된 모든 CEP 프로젝트의 상세 JSON을 하나의 번들 파일로 다운로드.
//        (이 번들을 QA 프롬프트/Claude Code에 넣어 프로젝트별로 검수)
//
// 원리: 직접 fetch가 400 나는 이유는 Authorization Bearer 헤더 누락.
//       axios 인터셉터와 동일하게 쿠키 auth._token.local 값을 Bearer로 붙인다.
// ============================================================
(async () => {
  // 1) 쿠키에서 액세스 토큰 → Authorization 헤더 재현
  const raw = (document.cookie.match(/(?:^|;\s*)auth\._token\.local=([^;]*)/) || [])[1] || '';
  const tok = decodeURIComponent(raw);
  if (!tok) { console.error('❌ auth._token.local 쿠키를 못 찾음. hubble 로그인 상태에서 실행하세요.'); return; }
  const authz = tok.startsWith('Bearer ') ? tok : 'Bearer ' + tok;
  const H = { 'Authorization': authz, 'Content-Type': 'application/json', 'Accept-Language': 'ko-KR' };

  // (옵션) 이 시점(KST) 이후 생성된 프로젝트만 수집. 빈 문자열이면 전체 수집.
  // ★ 화면 '최근 항목' 목록에 보이는 시각(KST)을 그대로 적으세요. 내부에서 UTC로 변환해 비교합니다.
  // 날짜만: '2026-07-22'  /  초 단위까지: '2026-07-22 14:20:00' (KST 기준)
  const SINCE_KST = '2026-07-22 14:20:00';   // = 14:20:08 로봇청소기부터 수집
  // KST(UTC+9) → UTC 변환. API created_time(UTC)과 문자열(초 단위)로 비교.
  const SINCE = SINCE_KST ? (() => {
    const m = SINCE_KST.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) { console.warn('⚠ SINCE_KST 형식 오류 → 필터 무시:', SINCE_KST); return ''; }
    const [, Y, Mo, D, h = '00', mi = '00', s = '00'] = m;
    const utc = new Date(Date.UTC(+Y, +Mo - 1, +D, +h - 9, +mi, +s));  // KST → UTC (-9h)
    return utc.toISOString().slice(0, 19).replace('T', ' ');
  })() : '';
  if (SINCE_KST) console.log(`⏱️  필터: KST ${SINCE_KST} 이후  =  UTC ${SINCE} 이후`);
  const api = (p) => fetch(p, { headers: H, credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject(`${r.status} ${p}`));

  // 2) 전체 프로젝트 목록 열거 (per_page 크게 잡아 페이지 순회)
  let rows = [], page = 1;
  while (true) {
    const res = await api(`/api/labs/cep_finder/projects?page=${page}&per_page=100`);
    const batch = res.result?.rows || [];
    rows = rows.concat(batch);
    if (batch.length < 100) break;   // 마지막 페이지
    page++;
  }
  console.log(`📋 프로젝트 ${rows.length}개 발견`);

  // 3) 각 상세 수집 (cep_cards 있는 완료 프로젝트만)
  const out = [];
  const skipped = [];
  for (const r of rows) {
    try {
      const d = await api(`/api/labs/cep_finder/project/${r.id}`);
      const detail = d.result;
      if (!detail?.cep_cards?.length) { skipped.push(`${r.id} ${r.product_name} (미완료/카드없음)`); continue; }
      // (옵션) created_time 기준 시점 필터 — SINCE(UTC) 이후 생성분만 수집 (초 단위 비교)
      if (SINCE) {
        const ct = (detail.created_time || '').slice(0, 19).replace('T', ' ');
        if (ct && ct < SINCE) { skipped.push(`${r.id} ${r.product_name} (${ct} UTC < ${SINCE} UTC 이전)`); continue; }
      }
      out.push(detail);
      console.log(`✓ ${r.id} ${r.product_name} — ${detail.cep_cards.length} cards${detail.created_time?` (${detail.created_time.slice(0,19).replace('T',' ')} UTC)`:''}`);
    } catch (e) {
      skipped.push(`${r.id} ${r.product_name} (에러: ${e})`);
      console.warn(`✗ ${r.id} ${r.product_name}: ${e}`);
    }
    await new Promise(s => setTimeout(s, 300));  // 서버 예의상 간격
  }

  // 4) 요약 + 번들 다운로드
  const totalCards = out.reduce((n, p) => n + (p.cep_cards?.length || 0), 0);
  console.log(`\n✅ 수집 완료: ${out.length}개 프로젝트 / 총 ${totalCards} 카드`);
  if (skipped.length) console.log(`⏭️  제외 ${skipped.length}개:`, skipped);

  const blob = new Blob([JSON.stringify({ harvested_projects: out.length, total_cards: totalCards, projects: out }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cep_bundle_${out.length}proj_${totalCards}cards${SINCE_KST?`_sinceKST${SINCE_KST.replace(/[ :]/g,'')}`:''}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log('⬇️  번들 다운로드 시작. 이 파일을 QA 단계에 투입하세요.');
})();
