// ============================================================
// dashboard-data.js 생성기
// 사용법: node gen-dashboard-data.js [번들1.json] [번들2.json] ...
// 기본 입력: description/cep_bundle_21proj_210cards.json
//            description/cep_bundle_14proj_140cards_since2026-07-14.json
// 출력: dashboard-data.js  (window.CEP_SNAPSHOT = {snapshot, rows, detail, diag, repropose})
//        여러 번들을 주면 project_id 기준으로 하나의 통합 목록으로 병합한다.
//        (같은 키워드라도 출처가 다르면 서로 다른 프로젝트이므로 이름으로 붕괴시키지 않고
//         모두 남기고, 대시보드에서 생성일(created_time) 컬럼으로 구분한다)
//
// 추출 로직은 dashboard.html 의 extractFromBundle() 과 동일하게 유지한다.
// (파일 업로드 경로와 정적 스냅샷 경로가 완전히 같은 결과를 내도록)
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const INS = process.argv.slice(2);
if (!INS.length) {
  INS.push("description/cep_bundle_21proj_210cards.json");
  INS.push("description/cep_bundle_14proj_140cards_since2026-07-14.json");
}
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
  let semUp=0;
  const cards=(p.cep_cards||[]).map((card,i)=>{
    const it=items[card.id]||{}, ck=it.checks||{};
    const cf=ck.category_fit||{}, sg=ck.source_grounding||{}, st=ck.structural||{}, w7=ck.sevenW_structure||{};
    const ev=card.evidence||{};
    const baseVerdict=it.verdict||ev.inspection_verdict||"none";
    const ov=semOv(p.project_id,card.id);           // 의미 치환 재판정 오버라이드
    const verdict=ov?ov.to:baseVerdict;
    const flags=(ck.hallucination_flags||[]).filter(f=>f&&f.occurred).map(f=>({type:f.type,label:FLAG_LABEL[f.type]||f.type,sev:FLAG_SEV[f.type]||"minor",note:trim(f.note,140)}));
    const findings=[];
    if(ov){
      semUp++;
      findings.push({code:"의미 치환 재판정 → pass",sev:"minor",detail:trim(ov.note,180)});
      // 출처 근거·할루시(출처 인용 없음)는 본문 근거 확인으로 해소. 카테고리 잔여 이슈만 표기.
      if(cf.status==="fail") findings.push({code:"카테고리 부적합",sev:"major",detail:trim(cf.evidence,180)});
      else if(cf.status==="partial") findings.push({code:"카테고리 부분적합",sev:"minor",detail:trim(cf.evidence,180)});
    } else {
      flags.forEach(f=>findings.push({code:"할루시네이션: "+f.label,sev:f.sev,detail:f.note||"inspection 플래그 occurred=true"}));
      if(sg.status==="fail") findings.push({code:"출처 근거 실패",sev:"major",detail:trim(sg.evidence,180)});
      else if(sg.status==="partial") findings.push({code:"출처 근거 부분적",sev:"minor",detail:trim(sg.evidence,180)});
      if(cf.status==="fail") findings.push({code:"카테고리 부적합",sev:"major",detail:trim(cf.evidence,180)});
      else if(cf.status==="partial") findings.push({code:"카테고리 부분적합",sev:"minor",detail:trim(cf.evidence,180)});
      (st.issues||[]).forEach(iss=>findings.push({code:"구조 문제",sev:"major",detail:trim(iss,180)}));
    }
    const sgDisp=ov?{status:"ok",ev:trim(ov.note,220)}:{status:sg.status||"",ev:trim(sg.evidence,220)};
    return {idx:i+1,cardId:card.id,cep:trim(card.cep,110),verdict,llm:it.llm_verdict||baseVerdict||"",overridden:!!it.verdict_overridden,
      semOverride:ov?{from:ov.from||baseVerdict,rule:ov.rule||"SEMANTIC_EQUIVALENCE",note:trim(ov.note,180)}:null,
      cf:{status:cf.status||"",ev:trim(cf.evidence,220)},sg:sgDisp,w7,flags:ov?flags.filter(f=>f.type!=="no_source_quote"):flags,findings};
  });
  const sev={critical:0,major:0,minor:0};
  cards.forEach(c=>c.findings.forEach(f=>{ if(sev[f.sev]!=null) sev[f.sev]++; }));
  // 오버라이드 반영 후 카드 verdict 기준으로 요약 재계산 (bundle insp.summary 대신)
  const eff={pass:0,warning:0,fail:0,none:0};
  cards.forEach(c=>{ const k=(c.verdict==="pass"||c.verdict==="fail"||c.verdict==="warning")?c.verdict:"none"; eff[k]++; });
  return {id:p.project_id,name:p.product_name,locale:p.locale,date:(p.created_time||"").slice(0,19).replace('T',' '),category:insp.category||"",model,
    summary:{pass:eff.pass,warn:eff.warning,fail:eff.fail,total:summary.total||cards.length,overall:(semUp?`【의미 치환 재판정 ${semUp}장 반영(→pass) — 아래 원본 검수 코멘트는 재판정 이전 기준입니다】 `:"")+trim(summary.overall_comment,1400)},
    overridden:cards.filter(c=>c.overridden).length,semUp,sev,cards};
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
      const ev=card.evidence||{}, baseV=ev.inspection_verdict;
      const so=semOv(p.project_id,card.id);          // 의미 치환 재판정 오버라이드
      const v=so?so.to:baseV;
      const key=(v==="pass"||v==="fail"||v==="warning")?v:"none"; c[key]++;
      const it=items[card.id]||{}, ck=it.checks||{}, checks=[];
      ["category_fit","source_grounding","structural"].forEach(name=>{
        const chk=ck[name]; if(chk&&typeof chk==="object"){
          if(name==="structural"){ const iss=chk.issues||[]; if(iss.length) checks.push({name:"구조",status:"fail",evidence:trim(iss.join("; "))}); }
          else if(name==="source_grounding"&&so){ checks.push({name:NM[name],status:"ok",evidence:trim(so.note,300)}); }
          else if(chk.status) checks.push({name:NM[name],status:chk.status,evidence:trim(chk.evidence)});
        }
      });
      const ov=it.override_reason, overrides=[];
      if(Array.isArray(ov)) ov.forEach(rr=>{ if(rr&&typeof rr==="object") overrides.push(`${rr.rule}: ${trim(rr.evidence,120)}`); });
      if(so) overrides.push(`${so.rule||"SEMANTIC_EQUIVALENCE"}: ${so.from||baseV}→${so.to} (의미 치환 동일)`);
      const sources=(ev.sources||[]).filter(s=>s&&s.url).map(s=>({title:trim(s.url_title||s.title,120),url:s.url,sec:s.section_number}));
      let quotes=(ev.quotes||[]).filter(q=>q&&typeof q==="object").map(q=>({quote:trim(q.quote,240),url:q.url,sec:q.section_id,verified:!!q.verified}));
      if(so&&so.quote) quotes=quotes.concat([{quote:trim(so.quote,240),url:so.url,sec:so.sec,verified:true}]);
      return {id:card.id,cep:trim(card.cep,110),v:key,reason:so?trim(so.note,200):trim(ev.verdict_reason,200),checks,halluc:so?false:hallucOf(ck.hallucination_flags),overrides,sources,quotes,semOverride:so?{from:so.from||baseV,rule:so.rule||"SEMANTIC_EQUIVALENCE"}:null};
    });
    DET[p.project_id]=cards;
    const n=c.pass+c.fail+c.warning+c.none;
    R.push({id:p.project_id,name:p.product_name,locale:p.locale,date:(p.created_time||"").slice(0,19).replace('T',' '),n,p:c.pass,w:c.warning,f:c.fail,none:c.none,insp:(c.pass+c.fail+c.warning)>0});
  });
  return {rows:R,detail:DET,diag:DG};
}

// ── repropose 로드 ──────────────────────────────────────────
// repropose/{project_id}.json 을 읽어 { [project_id]: <obj> } 맵으로 주입.
// (본문 기반 CEP 재제안 콘텐츠 — 번들에 없는 오프라인 사전생성 데이터)
function loadRepropose(dir="repropose"){
  const map={};
  if(!fs.existsSync(dir)) return map;
  fs.readdirSync(dir).filter(f=>f.endsWith(".json")).forEach(f=>{
    try{
      const obj=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
      const pid=obj.project_id!=null?obj.project_id:path.basename(f,".json");
      map[pid]=obj;
    }catch(e){ console.warn(`⚠ repropose 파싱 실패: ${f} — ${e.message}`); }
  });
  return map;
}

// ── 의미 치환(paraphrase) 재판정 오버라이드 로드 ────────────
// semantic-overrides.json 을 읽어 `${project_id}:${cardId}` → 오버라이드 맵으로 주입.
// 프롬프트가 출처 원문을 의미 보존하며 치환(부적절 표현 회피)했고 본문에 의미가 근거되면
// pass 로 승격한다. 원본 bundle 은 건드리지 않고 이 레이어에서만 판정을 덮어쓴다.
function loadSemanticOverrides(file="semantic-overrides.json"){
  const map={};
  if(!fs.existsSync(file)) return map;
  try{
    const obj=JSON.parse(fs.readFileSync(file,"utf8"));
    Object.keys(obj).forEach(pid=>{
      if(pid==="_meta") return;
      const arr=obj[pid]; if(!Array.isArray(arr)) return;
      arr.forEach(o=>{ if(o&&o.cardId!=null&&o.to) map[`${pid}:${o.cardId}`]=o; });
    });
  }catch(e){ console.warn(`⚠ semantic-overrides 파싱 실패 — ${e.message}`); }
  return map;
}
const SEM_OV = loadSemanticOverrides();
function semOv(pid,cardId){ return SEM_OV[`${pid}:${cardId}`]||null; }

// ── 여러 번들 병합 (project_id 유일 기준) ───────────────────
// 여러 하베스트 번들을 하나의 통합 목록으로 합친다.
// 완전히 같은 project_id 만 중복으로 보고 최신 created_time 1건만 남긴다.
// (같은 제품명이라도 project_id 가 다르면 출처가 다른 별개 프로젝트 → 모두 유지,
//  대시보드는 생성일 컬럼으로 구분한다)
function mergeBundles(paths){
  const byId = {};
  paths.forEach(p => {
    const b = JSON.parse(fs.readFileSync(p, "utf8"));
    (b.projects || b || []).forEach(proj => {
      const id = proj.project_id;
      const cur = byId[id];
      if (!cur || String(proj.created_time||"") > String(cur.created_time||"")) byId[id] = proj;
    });
  });
  return { projects: Object.values(byId) };
}

// ── 실행 ────────────────────────────────────────────────────
const bundle = mergeBundles(INS);
const { rows, detail, diag } = extractFromBundle(bundle);
const repropose = loadRepropose();

const totalCards = rows.reduce((s,r)=>s+r.n,0);
const inspProj = rows.filter(r=>r.insp).length;
const reproCnt = Object.keys(repropose).length;
const srcLabel = INS.map(p=>path.basename(p)).join(" + ");
const snapshot = `번들: ${srcLabel} · 프로젝트 ${rows.length}개 / 카드 ${totalCards}개 · 검수 ${inspProj}개`;

const payload = { snapshot, rows, detail, diag, repropose };

const js = `// 자동 생성됨 — gen-dashboard-data.js (입력: ${srcLabel})\n`
         + `// 수정하지 말 것. 갱신: node gen-dashboard-data.js <번들1.json> [번들2.json ...]\n`
         + `window.CEP_SNAPSHOT = ${JSON.stringify(payload)};\n`;
fs.writeFileSync(OUT, js);

// ── 캐시 버스팅 ─────────────────────────────────────────────
// 콘텐츠 해시(8자리)를 dashboard.html 의 <script src> 쿼리에 주입한다.
// 데이터가 바뀔 때만 URL 이 달라져 브라우저/CDN 캐시가 정확히 무효화됨.
const ver = crypto.createHash("sha1").update(js).digest("hex").slice(0, 8);
const HTML = "dashboard.html";
let htmlUpdated = false;
if (fs.existsSync(HTML)) {
  const html = fs.readFileSync(HTML, "utf8");
  const re = /(<script\s+src=")dashboard-data\.js(?:\?v=[^"]*)?(")/;
  if (re.test(html)) {
    const next = html.replace(re, `$1dashboard-data.js?v=${ver}$2`);
    if (next !== html) { fs.writeFileSync(HTML, next); }
    htmlUpdated = true;
  }
}

console.log(`✅ ${OUT} 생성`);
console.log(`   ${snapshot}`);
console.log(`   본문 기반 재제안: ${reproCnt}개 프로젝트${reproCnt?` (${Object.keys(repropose).join(", ")})`:""}`);
const semTotal=Object.keys(SEM_OV).length;
console.log(`   의미 치환 재판정(→pass): ${semTotal}장${semTotal?` — 프로젝트별 ${Object.values(diag).filter(d=>d.semUp).map(d=>`${d.id}:${d.semUp}`).join(", ")}`:""}`);
console.log(`   파일 크기: ${(Buffer.byteLength(js)/1024).toFixed(0)} KB`);
console.log(`   캐시 버전(v): ${ver}${htmlUpdated?` → ${HTML} 스크립트 태그 갱신됨`:` (⚠ ${HTML} 스크립트 태그를 찾지 못함 — 수동 확인 필요)`}`);
