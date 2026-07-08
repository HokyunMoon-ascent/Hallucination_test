// ============================================================
// dashboard-data.js 생성기
// 사용법: node gen-dashboard-data.js [번들파일.json]
// 기본 입력: cep_bundle_20proj_200cards.json
// 출력: dashboard-data.js  (window.CEP_SNAPSHOT = {snapshot, rows, detail})
//
// 추출 로직은 dashboard.html 의 extractFromBundle() 과 동일하게 유지한다.
// (파일 업로드 경로와 정적 스냅샷 경로가 완전히 같은 결과를 내도록)
// ============================================================
const fs = require("fs");
const path = require("path");

const IN = process.argv[2] || "cep_bundle_20proj_200cards.json";
const OUT = "dashboard-data.js";

// ── dashboard.html 과 동일한 추출/진단 로직 ─────────────────
const FLAG_LABEL={vague_expression:"모호한 표현",category_mismatch:"카테고리 불일치",no_source_quote:"출처 인용 없음",fabricated_detail:"세부사항 날조",unfounded_superlative:"근거없는 최상급",redundant:"중복 표현"};
const FLAG_SEV={fabricated_detail:"critical",no_source_quote:"major",category_mismatch:"major",unfounded_superlative:"minor",vague_expression:"minor",redundant:"minor"};
function buildDiag(p){
  const trim=(s,n=300)=>{s=String(s==null?"":s).trim();return s.length>n?s.slice(0,n)+"…":s;};
  const insp=p.inspection||{}, items={};
  (insp.items||[]).forEach(it=>{ if(it&&it.card_id!=null) items[it.card_id]=it; });
  const summary=insp.summary||{};
  const model=insp.model_info?`${insp.model_info.provider||""}/${insp.model_info.model||""}`.replace(/^\/|\/$/g,""):"";
  const cards=(p.cep_cards||[]).map((card,i)=>{
    const it=items[card.id]||{}, ck=it.checks||{};
    const cf=ck.category_fit||{}, sg=ck.source_grounding||{}, st=ck.structural||{}, w7=ck.sevenW_structure||{};
    const ev=card.evidence||{};
    const verdict=it.verdict||ev.inspection_verdict||"none";
    const flags=(ck.hallucination_flags||[]).filter(f=>f&&f.occurred).map(f=>({type:f.type,label:FLAG_LABEL[f.type]||f.type,sev:FLAG_SEV[f.type]||"minor",note:trim(f.note,140)}));
    const findings=[];
    flags.forEach(f=>findings.push({code:"할루시네이션: "+f.label,sev:f.sev,detail:f.note||"inspection 플래그 occurred=true"}));
    if(sg.status==="fail") findings.push({code:"출처 근거 실패",sev:"major",detail:trim(sg.evidence,180)});
    else if(sg.status==="partial") findings.push({code:"출처 근거 부분적",sev:"minor",detail:trim(sg.evidence,180)});
    if(cf.status==="fail") findings.push({code:"카테고리 부적합",sev:"major",detail:trim(cf.evidence,180)});
    else if(cf.status==="partial") findings.push({code:"카테고리 부분적합",sev:"minor",detail:trim(cf.evidence,180)});
    (st.issues||[]).forEach(iss=>findings.push({code:"구조 문제",sev:"major",detail:trim(iss,180)}));
    return {idx:i+1,cardId:card.id,cep:trim(card.cep,110),verdict,llm:it.llm_verdict||"",overridden:!!it.verdict_overridden,
      cf:{status:cf.status||"",ev:trim(cf.evidence,220)},sg:{status:sg.status||"",ev:trim(sg.evidence,220)},w7,flags,findings};
  });
  const sev={critical:0,major:0,minor:0};
  cards.forEach(c=>c.findings.forEach(f=>{ if(sev[f.sev]!=null) sev[f.sev]++; }));
  return {id:p.project_id,name:p.product_name,locale:p.locale,category:insp.category||"",model,
    summary:{pass:summary.pass||0,warn:summary.warning||0,fail:summary.fail||0,total:summary.total||cards.length,overall:trim(summary.overall_comment,1400)},
    overridden:cards.filter(c=>c.overridden).length,sev,cards};
}

function extractFromBundle(d){
  const projs=d.projects||d; const R=[], DET={}, DG={};
  const trim=(s,n=300)=>{s=String(s==null?"":s).trim();return s.length>n?s.slice(0,n)+"…":s;};
  const hallucOf=hf=>Array.isArray(hf)?hf.length>0:(hf&&typeof hf==="object"?!!hf.occurred:false);
  const NM={category_fit:"카테고리 적합",source_grounding:"출처 근거"};
  projs.forEach(p=>{
    DG[p.project_id]=buildDiag(p);
    const c={pass:0,fail:0,warning:0,none:0};
    const insp=p.inspection, items={};
    if(insp&&Array.isArray(insp.items)) insp.items.forEach(it=>items[it.card_id]=it);
    const cards=(p.cep_cards||[]).map(card=>{
      const ev=card.evidence||{}, v=ev.inspection_verdict;
      const key=(v==="pass"||v==="fail"||v==="warning")?v:"none"; c[key]++;
      const it=items[card.id]||{}, ck=it.checks||{}, checks=[];
      ["category_fit","source_grounding","structural"].forEach(name=>{
        const chk=ck[name]; if(chk&&typeof chk==="object"){
          if(name==="structural"){ const iss=chk.issues||[]; if(iss.length) checks.push({name:"구조",status:"fail",evidence:trim(iss.join("; "))}); }
          else if(chk.status) checks.push({name:NM[name],status:chk.status,evidence:trim(chk.evidence)});
        }
      });
      const ov=it.override_reason, overrides=[];
      if(Array.isArray(ov)) ov.forEach(rr=>{ if(rr&&typeof rr==="object") overrides.push(`${rr.rule}: ${trim(rr.evidence,120)}`); });
      const sources=(ev.sources||[]).filter(s=>s&&s.url).map(s=>({title:trim(s.url_title||s.title,120),url:s.url,sec:s.section_number}));
      const quotes=(ev.quotes||[]).filter(q=>q&&typeof q==="object").map(q=>({quote:trim(q.quote,240),url:q.url,sec:q.section_id,verified:!!q.verified}));
      return {id:card.id,cep:trim(card.cep,110),v:key,reason:trim(ev.verdict_reason,200),checks,halluc:hallucOf(ck.hallucination_flags),overrides,sources,quotes};
    });
    DET[p.project_id]=cards;
    const n=c.pass+c.fail+c.warning+c.none;
    R.push({id:p.project_id,name:p.product_name,locale:p.locale,n,p:c.pass,w:c.warning,f:c.fail,none:c.none,insp:(c.pass+c.fail+c.warning)>0});
  });
  return {rows:R,detail:DET,diag:DG};
}

// ── 실행 ────────────────────────────────────────────────────
const bundle = JSON.parse(fs.readFileSync(IN, "utf8"));
const { rows, detail, diag } = extractFromBundle(bundle);

const totalCards = rows.reduce((s,r)=>s+r.n,0);
const inspProj = rows.filter(r=>r.insp).length;
const snapshot = `번들: ${path.basename(IN)} · 프로젝트 ${rows.length}개 / 카드 ${totalCards}개 · 검수 ${inspProj}개`;

const payload = { snapshot, rows, detail, diag };
const js = `// 자동 생성됨 — gen-dashboard-data.js (입력: ${path.basename(IN)})\n`
         + `// 수정하지 말 것. 갱신: node gen-dashboard-data.js <번들.json>\n`
         + `window.CEP_SNAPSHOT = ${JSON.stringify(payload)};\n`;
fs.writeFileSync(OUT, js);

console.log(`✅ ${OUT} 생성`);
console.log(`   ${snapshot}`);
console.log(`   파일 크기: ${(js.length/1024).toFixed(0)} KB`);
