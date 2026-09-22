let LETTERS=[],LAWS=[],ACT_RULES_MAP={},lawMap=new Map(),shown=0,lshown=0,searchLetterRows=[],letterRows=[],LETTER_REF_CACHE=new Map(),REF_INDEX=new Map(),EXACT_INDEX=new Map(),REF_INDEX_READY=false;const PAGE=40,$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayArticleNo=s=>String(s??'').replace(/^第(\d+)-(\d+)條$/,'第$1條之$2');
const norm=s=>String(s||'').toLowerCase().replace(/[\s　]+/g,' ').trim(); const tokens=s=>norm(s).split(' ').filter(Boolean); const reEsc=s=>String(s??'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// 清除工程會舊版網頁因固定欄寬產生的「排版換行」。
// 原則：同一段落中若前行尚未結束，且下一行不是新的項／款／目／編號，就接回同一行；
// 真正的段落、項款目與清單換行仍保留。只處理網站顯示資料，不修改原始 JSON。
function smartLawWrap(text){
  const raw=String(text??'').replace(/\r\n?/g,'\n');
  if(!raw.includes('\n'))return raw;
  const lines=raw.split('\n');
  const out=[];
  const startsStructure=s=>/^(?:第[一二三四五六七八九十百千0-9]+(?:項|款|目)|[一二三四五六七八九十百千]+[、．.]|[（(][一二三四五六七八九十百千0-9]+[）)]|\d+[、．.]|[甲乙丙丁戊己庚辛壬癸][、．.]|附表|附錄|附件)/.test(s);
  const endsParagraph=s=>/[。！？；]$/.test(s);
  for(let i=0;i<lines.length;i++){
    const cur=lines[i].trim();
    if(!cur){if(out.length&&out[out.length-1]!=='')out.push('');continue}
    if(!out.length||out[out.length-1]===''){out.push(cur);continue}
    const prev=out[out.length-1];
    // 前句已完整結束，或下一行明顯是新項／款／目／編號：保留真正換行。
    if(endsParagraph(prev)||startsStructure(cur)) out.push(cur);
    else out[out.length-1]=prev+cur;
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n');
}
function normalizeLawDisplayData(laws){
  for(const l of laws){
    if(typeof l.fullText==='string')l.fullText=smartLawWrap(l.fullText);
    if(Array.isArray(l.articles))for(const a of l.articles)if(typeof a.text==='string')a.text=smartLawWrap(a.text);
  }
}
function lawText(l){return [l.name,l.category,l.published,l.updated,l.fullText,...l.articles.flatMap(a=>[a.no,a.text])].join('\n')}
function letterText(r,scope='all'){if(scope==='basis')return r.basis||'';if(scope==='subject')return r.subject||'';if(scope==='body')return r.body||'';return [r.basis,r.subject,r.body,r.docNo,r.issuer,r.pkPrmsRuleContent].join(' ')}
function hi(s,ts){let x=esc(s);for(const t of ts){let p=esc(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(p)x=x.replace(new RegExp(p,'gi'),m=>`<mark>${m}</mark>`)}return x}
function key(law,no){return `${law}|${String(no).replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'')}`}
function findArticle(law,no){let l=lawMap.get(law);if(!l)return null;let n=String(no).replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'');return l.articles.find(a=>a.no.replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'')===n)}
let _lawAliasPattern='',CONTEXT_ALIASES=[];
function buildLawAliasPattern(){
  const aliases=[];
  for(const l of LAWS){if(l?.name)aliases.push(l.name)}
  aliases.push('採購法施行細則','採購法');
  const uniq=[...new Set(aliases)].sort((a,b)=>b.length-a.length);
  _lawAliasPattern=uniq.map(reEsc).join('|');

  // 建立「上下文簡稱 → 正式法規名稱」字典。
  // 例如：共同供應契約 → 共同供應契約實施辦法。
  // 只有可唯一對應且長度足夠的簡稱才採用，寧可不連，也不要誤連。
  const candidates=new Map();
  const suffixes=['實施辦法','作業辦法','管理辦法','評選辦法','監辦辦法','收費辦法','辦法','審議規則','調解規則','規則','組織準則','準則','認定標準','標準','執行注意事項','注意事項','作業要點','要點','執行程序','作業規定','規定','一覽表'];
  for(const l of LAWS){
    const name=l?.name||'';
    if(!name)continue;
    const arr=[name];
    for(const suf of suffixes){
      if(name.endsWith(suf)){
        const a=name.slice(0,-suf.length).trim();
        if(a.length>=4)arr.push(a);
      }
    }
    for(const a of arr){
      if(!candidates.has(a))candidates.set(a,new Set());
      candidates.get(a).add(name);
    }
  }
  CONTEXT_ALIASES=[...candidates.entries()]
    .filter(([a,names])=>a.length>=4&&names.size===1)
    .map(([alias,names])=>({alias,law:[...names][0]}))
    .sort((a,b)=>b.alias.length-a.alias.length);
}
function canonicalLawName(alias){
  if(alias==='採購法')return '政府採購法';
  if(alias==='採購法施行細則')return '政府採購法施行細則';
  return alias;
}
function resolveContextLaw(text,pos,pronoun,out){
  // 1. 最近已成功辨識的明示法規，距離太遠則不沿用。
  const prev=out.filter(x=>x.start<pos&&x.explicit).sort((a,b)=>b.start-a.start)[0];
  if(prev && pos-prev.end<=180){
    const n=prev.law;
    if(pronoun==='本辦法'||pronoun==='同辦法'||pronoun==='該辦法'||pronoun==='前開辦法'){
      if(/辦法$/.test(n))return n;
    }else if(pronoun==='本法'||pronoun==='同法'||pronoun==='該法'){
      if(/法$|條例$/.test(n))return n;
    }else return n;
  }
  // 2. 往前最多約300字找正式法規名稱或可唯一對應的簡稱。
  const start=Math.max(0,pos-320),ctx=text.slice(start,pos);
  let best=null;
  for(const l of LAWS){
    const name=l?.name||''; if(!name)continue;
    const i=ctx.lastIndexOf(name);
    if(i>=0 && (!best||i>best.i))best={i,law:name};
  }
  for(const x of CONTEXT_ALIASES){
    const i=ctx.lastIndexOf(x.alias);
    if(i>=0 && (!best||i>best.i))best={i,law:x.law};
  }
  if(!best)return null;
  if(pronoun==='本辦法'||pronoun==='同辦法'||pronoun==='該辦法'||pronoun==='前開辦法')return /辦法$/.test(best.law)?best.law:null;
  if(pronoun==='本法'||pronoun==='同法'||pronoun==='該法')return /法$|條例$/.test(best.law)?best.law:null;
  return best.law;
}
function refs(text){
  text=String(text||'');
  if(!_lawAliasPattern)return [];
  const out=[],covered=[];
  const add=(law,a,start,end,explicit=true)=>{
    law=canonicalLawName(law);
    if(!lawMap.has(law))return;
    if(!findArticle(law,a))return;
    out.push({law,a,start,end,explicit}); covered.push([start,end]);
  };
  // 特例：政府採購法（下稱採購法）施行細則第42條 → 施行細則第42條
  let m;
  const rulesWithDefinedAlias=/政府採購法\s*[（(][^）)]{0,40}(?:下稱|簡稱)[^）)]*[）)]\s*施[行行]細則\s*第\s*(\d{1,3})(?:\s*條\s*之\s*(\d+)|\s*條|\s*之\s*(\d+)\s*條?)/g;
  while((m=rulesWithDefinedAlias.exec(text))){
    const a=m[1]+((m[2]||m[3])?'-'+(m[2]||m[3]):'');
    add('政府採購法施行細則',a,m.index,rulesWithDefinedAlias.lastIndex,true);
  }
  // 明示法規名稱＋條號。法規名稱後容許引號、括號內簡稱等少量文字。
  const explicit=new RegExp(`(${_lawAliasPattern})(?:[\\s　「」『』《》〈〉【】、，,：:]|[（(][^）)]{0,40}[）)])*第\\s*(\\d{1,3})(?:\\s*條\\s*之\\s*(\\d+)|\\s*條|\\s*之\\s*(\\d+)\\s*條?)`,'g');
  while((m=explicit.exec(text))){
    if(covered.some(([a,b])=>m.index>=a&&m.index<b))continue;
    const a=m[2]+((m[3]||m[4])?'-'+(m[3]||m[4]):'');
    add(m[1],a,m.index,explicit.lastIndex,true);
  }
  // 母法 →「其施行細則／施行細則」切換。
  // 例：採購法第46條及其施行細則第50條 → 第46條屬政府採購法，第50條屬政府採購法施行細則。
  // 必須放在一般 chained 規則之前，避免第50條錯誤繼承前一個母法。
  const enforcement=/(?:及|暨|與|和|、)?\s*(?:其|本法之|該法之|本法|該法)?\s*施[行行]細則\s*第\s*(\d{1,3})(?:\s*條\s*之\s*(\d+)|\s*條|\s*之\s*(\d+)\s*條?)/g;
  while((m=enforcement.exec(text))){
    if(covered.some(([a,b])=>m.index>=a&&m.index<b))continue;
    const prev=out.filter(x=>x.start<m.index).sort((a,b)=>b.start-a.start)[0];
    if(!prev || m.index-prev.end>100)continue;
    let rules=null;
    // 優先找「母法正式名稱＋施行細則」。採購法簡稱已先正規化成政府採購法。
    const candidates=[prev.law+'施行細則'];
    // 若前一個本來就是施行細則，則沿用該施行細則。
    if(/施[行行]細則$/.test(prev.law))candidates.unshift(prev.law);
    for(const c of candidates){if(lawMap.has(c)){rules=c;break}}
    if(!rules)continue; // 找不到明確對應施行細則時，寧可不連。
    const a=m[1]+((m[2]||m[3])?'-'+(m[2]||m[3]):'');
    add(rules,a,m.index,enforcement.lastIndex,true);
  }
  // 「本法／本辦法／同法／同辦法」採上下文追溯；不再一律沿用前一個條文。
  // 無代名詞的連續「第57條」仍可在短距離內繼承最近法規。
  const chained=/(同法|同辦法|本法|本辦法|該法|該辦法|前開辦法)?[\s　、，,；;及與和或]*第\s*(\d{1,3})(?:\s*條\s*之\s*(\d+)|\s*條|\s*之\s*(\d+)\s*條?)/g;
  while((m=chained.exec(text))){
    if(covered.some(([a,b])=>m.index>=a&&m.index<b))continue;
    const pronoun=m[1]||'';
    let law=null;
    if(pronoun){
      law=resolveContextLaw(text,m.index,pronoun,out);
    }else{
      const prev=out.filter(x=>x.start<m.index).sort((a,b)=>b.start-a.start)[0];
      if(prev && m.index-prev.end<=80)law=prev.law;
    }
    if(!law)continue;
    const a=m[2]+((m[3]||m[4])?'-'+(m[3]||m[4]):'');
    if(findArticle(law,a)) out.push({law,a,start:m.index,end:chained.lastIndex,explicit:false});
  }
  out.sort((a,b)=>a.start-b.start || (b.end-b.start)-(a.end-a.start));
  const clean=[];
  for(const r of out){if(clean.some(x=>r.start<x.end&&r.end>x.start))continue;clean.push(r)}
  return clean;
}
function linkRefs(text,ts=[]){
  text=String(text||'');const rs=refs(text);let pos=0,out='';
  for(const r of rs){
    if(r.start<pos)continue;
    out+=hi(text.slice(pos,r.start),ts);
    const label=text.slice(r.start,r.end);
    out+=`<button class="lawref" title="開啟 ${esc(r.law)} 第${esc(r.a.replace('-','條之'))}條" data-law="${esc(r.law)}" data-a="${esc(r.a)}">${hi(label,ts)}</button>`;
    pos=r.end;
  }
  return out+hi(text.slice(pos),ts);
}
function actRefsForLaw(l){let rs=refs(lawText(l)).filter(r=>r.law==='政府採購法'),u=[];for(const r of rs)if(!u.includes(r.a))u.push(r.a);return u}
function letterRefs(r){if(LETTER_REF_CACHE.has(r.index))return LETTER_REF_CACHE.get(r.index);let t=(r.basis||'')+'\n'+(r.body||'')+'\n'+(r.subject||'');let rr=refs(t);LETTER_REF_CACHE.set(r.index,rr);return rr}
function lettersFor(law,a){let k=law+'|'+a;if(REF_INDEX_READY){let ids=REF_INDEX.get(k)||[];return ids.map(id=>LETTERS.find(r=>r.index===id)).filter(Boolean)}return LETTERS.filter(r=>letterRefs(r).some(x=>x.law===law&&x.a===a))}
function buildRefIndexAsync(){REF_INDEX.clear();EXACT_INDEX.clear();REF_INDEX_READY=false;let i=0;const chunk=()=>{let end=Math.min(i+40,LETTERS.length);for(;i<end;i++){let r=LETTERS[i];for(const x of refs(r.basis||'')){let k=x.law+'|'+x.a,arr=EXACT_INDEX.get(k);if(!arr)EXACT_INDEX.set(k,arr=[]);if(!arr.includes(r.index))arr.push(r.index)}for(const x of letterRefs(r)){let k=x.law+'|'+x.a,arr=REF_INDEX.get(k);if(!arr)REF_INDEX.set(k,arr=[]);if(!arr.includes(r.index))arr.push(r.index)}}if(i<LETTERS.length){setTimeout(chunk,0)}else{REF_INDEX_READY=true;refreshVisibleArticleCounts()}};setTimeout(chunk,0)}
function refreshVisibleArticleCounts(){document.querySelectorAll('.article-count').forEach(c=>{let ids=REF_INDEX.get(c.dataset.countLaw+'|'+c.dataset.countA)||[];{let ex=(EXACT_INDEX.get(c.dataset.countLaw+'|'+c.dataset.countA)||[]).length;c.textContent=ex?ex+'筆精準／'+ids.length+'筆相關':ids.length+'筆相關'}})}
function lawsForAct(a){return LAWS.filter(l=>l.name!=='政府採購法'&&actRefsForLaw(l).includes(a))}
function relatedRulesForAct(a){
  const k=String(a).replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'');
  const ruleLaw=lawMap.get('政府採購法施行細則');
  if(!ruleLaw)return [];
  return (ACT_RULES_MAP[k]||[]).map(no=>findArticle('政府採購法施行細則',no)).filter(Boolean);
}
function renderLetter(r,ts=[],full=true){return `<article class="letter" id="letter-${r.index}"><div class="meta"><span class="idx">#${String(r.index).padStart(4,'0')}</span><span>${esc(r.rocDate)}</span><span>${hi(r.docNo,ts)}</span><span>${esc(r.issuer)}</span></div><div class="subject">${hi(r.subject||'(無主旨)',ts)}</div><div class="basis"><b>PRMS原始法規依據：</b>${linkRefs(r.basis||'—',ts)}</div>${full?`<div class="body">${linkRefs(r.body||'',ts)}</div>`:''}<div class="actions"><a href="${esc(r.url)}" target="_blank" rel="noopener">工程會原文 ↗</a></div></article>`}
function showView(v){document.querySelectorAll('.view').forEach(x=>x.hidden=true);document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#'+v+'View').hidden=false;if(v==='laws')renderLaws();if(v==='articles')renderArticleList();if(v==='letters'&&!letterRows.length)runLetterSearch()}
function snippet(text,ts,span=72){
  text=String(text||'').replace(/\s+/g,' ').trim();
  if(!text)return '';
  let low=text.toLowerCase(),positions=ts.map(t=>low.indexOf(t.toLowerCase())).filter(i=>i>=0);
  let at=positions.length?Math.min(...positions):0,start=Math.max(0,at-span),end=Math.min(text.length,at+span+Math.max(...ts.map(t=>t.length),1));
  let x=text.slice(start,end);return (start?'…':'')+hi(x,ts)+(end<text.length?'…':'');
}
function lawSearchHits(ts){
  const hits=[];
  for(const l of LAWS){
    if(l.articles.length){
      for(const a of l.articles){
        const hay=norm(a.text);
        if(ts.every(t=>hay.includes(t)))hits.push({law:l,no:a.no,text:a.text,target:'article',targetKey:a.no});
      }
    }else{
      const paras=String(l.fullText||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      paras.forEach((para,i)=>{const hay=norm(para);if(ts.every(t=>hay.includes(t)))hits.push({law:l,no:`全文第${i+1}段`,text:para,target:'full',targetKey:String(i)});});
    }
  }
  return hits;
}
function runSearch(){
  let ts=tokens($('#q').value),scope=$('#scope').value;
  let lh=scope==='letters'||!ts.length?[]:lawSearchHits(ts);
  searchLetterRows=scope==='laws'?[]:LETTERS.filter(r=>ts.length&&ts.every(t=>norm(letterText(r)).includes(t))).sort((a,b)=>b.index-a.index);shown=0;
  const visibleHits=lh.slice(0,200),lawGroups=[];
  for(const h of visibleHits){let g=lawGroups.find(x=>x.name===h.law.name);if(!g){g={name:h.law.name,hits:[]};lawGroups.push(g)}g.hits.push(h)}
  const lawItems=lawGroups.map(g=>`<section class="lawhit-law-group collapsed"><button type="button" class="lawhit-law-toggle" aria-expanded="false"><span><b>${esc(g.name)}</b><span class="lawhit-law-count">${g.hits.length} 個命中位置</span></span><span class="lawhit-law-toggle-label">▼ 展開</span></button><div class="lawhit-law-body" hidden>${g.hits.map(h=>`<button class="lawhit lawhit-point" data-lawname="${esc(h.law.name)}" data-target="${h.target}" data-targetkey="${esc(h.targetKey)}" data-search="${esc($('#q').value)}"><b>${esc(h.no)}</b><span class="hit-snippet">${snippet(h.text,ts)}</span></button>`).join('')}</div></section>`).join('')+(lh.length>200?`<div class="status">結果較多，目前顯示前200個命中位置。</div>`:'');
  $('#lawHits').innerHTML=lh.length?`<section class="lawhits-group collapsed"><button type="button" class="lawhits-toggle" aria-expanded="false"><span>主管法規找到 <b>${lh.length.toLocaleString()}</b> 個命中位置，共 <b>${lawGroups.length.toLocaleString()}</b> 部法規</span><span class="lawhits-toggle-label">▼ 全部展開</span></button><div class="lawhits-body">${lawItems}</div></section>`:'';
  $('#letterHits').innerHTML='';$('#searchLawPreview').hidden=true;$('#searchLawPreview').innerHTML='<div class="empty">點選主管法規的命中位置，即可在此預覽。</div>';renderSearchMore();$('#searchStatus').className='status';$('#searchStatus').textContent=ts.length?`搜尋「${$('#q').value}」`:'請輸入關鍵字搜尋145筆主管法規與3,666筆函釋';
}
function renderSearchMore(){if(!tokens($('#q').value).length){$('#more').hidden=true;return}let part=searchLetterRows.slice(shown,shown+PAGE);shown+=part.length;if(part.length)$('#letterHits').insertAdjacentHTML('beforeend',(shown===part.length?`<div class="status">函釋找到 ${searchLetterRows.length.toLocaleString()} 筆</div>`:'')+part.map(r=>renderLetter(r,tokens($('#q').value),$('#full').checked)).join(''));$('#more').hidden=shown>=searchLetterRows.length}
function openSearchLawPreview(name,target='',targetKey='',search=''){
  let l=lawMap.get(name);if(!l)return;let ts=tokens(search),content='';
  if(l.articles.length){
    content=l.articles.map(a=>`<section class="preview-law-article" id="preview-lawtarget-${encodeURIComponent(a.no)}"><h3>${esc(a.no)}</h3><div class="txt">${linkRefs(a.text,ts)}</div></section>`).join('');
  }else{
    let paras=String(l.fullText||'（無全文內容）').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    content=`<div class="preview-fulltext">${paras.map((x,i)=>`<div class="preview-fulltext-para" id="preview-lawfull-${i}">${linkRefs(x,ts)}</div>`).join('')}</div>`;
  }
  let p=$('#searchLawPreview');p.hidden=false;p.innerHTML=`<div class="search-preview-head"><div><h2>${esc(l.name)}</h2><div class="lawmeta">${esc(l.category)}<br>公發布：${esc(l.published||'—')}　｜　最新異動：${esc(l.updated||'—')}</div></div><button type="button" class="search-preview-close" aria-label="關閉預覽">×</button></div><div class="search-preview-content">${content}</div><div class="search-preview-footer"><a href="#" class="open-full-law" data-full-lawname="${esc(l.name)}" data-full-target="${target}" data-full-targetkey="${esc(targetKey)}" data-full-search="${esc(search)}">開啟完整法規頁面 ↗</a></div>`;
  let id=target==='article'?'preview-lawtarget-'+encodeURIComponent(targetKey):target==='full'?'preview-lawfull-'+targetKey:'';
  if(id)setTimeout(()=>{let el=document.getElementById(id);if(el){el.classList.add('search-target');el.scrollIntoView({behavior:'smooth',block:'center'})}},20);
}
function renderLaws(){let q=norm($('#lawq').value),cat=$('#category').value,arr=LAWS.filter(l=>(!cat||l.category===cat)&&(!q||norm(lawText(l)).includes(q)));$('#lawsCount').className='status';$('#lawsCount').textContent=`共 ${arr.length} 筆`;let groups={};arr.forEach(l=>(groups[l.category]??=[]).push(l));$('#lawsList').innerHTML=Object.entries(groups).map(([c,ls])=>`<div class="catgroup"><h3>${esc(c)} <span class="muted">${ls.length}筆</span></h3>${ls.map(l=>`<div class="lawrow"><div><div class="lawname" data-lawname="${esc(l.name)}">${esc(l.name)}</div><div class="lawmeta">公發布：${esc(l.published||'—')}　｜　最新異動：${esc(l.updated||'—')}　｜　${l.articles.length?`${l.articles.length}個條文`:'全文式資料'}</div></div><span class="pill">${esc(l.dataType||'法規')}</span></div>`).join('')}</div>`).join('')||'<div class="empty">沒有符合條件的法規</div>'}
function openLaw(name,target='',targetKey='',search=''){
  let l=lawMap.get(name);if(!l)return;showView('lawDetail');let ts=tokens(search);
  let content;
  if(l.articles.length){
    content=l.articles.map(a=>`<section class="law-article" id="lawtarget-${encodeURIComponent(a.no)}"><h3>${esc(a.no)}</h3><div class="txt">${linkRefs(a.text,ts)}</div></section>`).join('');
  }else{
    let paras=String(l.fullText||'（無全文內容）').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    content=`<div class="fulltext">`+paras.map((x,i)=>`<div class="fulltext-para" id="lawfull-${i}">${linkRefs(x,ts)}</div>`).join('')+`</div>`;
  }
  $('#lawDetail').innerHTML=`<div class="lawdetail-head"><h2>${esc(l.name)}</h2><div class="lawmeta">${esc(l.category)}<br>公發布：${esc(l.published||'—')}　｜　最新異動：${esc(l.updated||'—')}　｜　資料型態：${esc(l.dataType||'—')}</div><a class="official" href="${esc(l.url)}" target="_blank" rel="noopener">工程會法規原始頁面 ↗</a></div>${content}`;
  let id='';if(target==='article')id='lawtarget-'+encodeURIComponent(targetKey);else if(target==='full')id='lawfull-'+targetKey;
  if(id){setTimeout(()=>{let el=document.getElementById(id);if(el){el.classList.add('search-target');el.scrollIntoView({behavior:'smooth',block:'center'})}},30)}else scrollTo(0,0)
}
function renderArticleList(){let name=$('#articleLaw').value,l=lawMap.get(name);if(!l)return;$('#articleList').innerHTML=`<b>${esc(name)}</b>`+l.articles.map(a=>{let n=a.no.replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'');return `<button class="article-row" data-a="${n}"><span>${esc(displayArticleNo(a.no))}</span><small class="article-count" data-count-law="${esc(name)}" data-count-a="${esc(n)}">${REF_INDEX_READY?(()=>{let all=(REF_INDEX.get(name+'|'+n)||[]).length,ex=(EXACT_INDEX.get(name+'|'+n)||[]).length;return ex?ex+'筆精準／'+all+'筆相關':all+'筆相關'})():'計算中…'}</small></button>`}).join('');if(REF_INDEX_READY)refreshVisibleArticleCounts()}
function selectArticle(a){let law=$('#articleLaw').value,ar=findArticle(law,a);if(!ar)return;document.querySelectorAll('.article-row').forEach(x=>x.classList.toggle('selected',x.dataset.a===a));let rel=lettersFor(law,a).sort((x,y)=>y.index-x.index),exactIds=new Set(EXACT_INDEX.get(law+'|'+a)||[]),exact=rel.filter(r=>exactIds.has(r.index)),mention=rel.filter(r=>!exactIds.has(r.index)),relatedLaws=law==='政府採購法'?lawsForAct(a):[],relatedRules=law==='政府採購法'?relatedRulesForAct(a):[];let c=[...document.querySelectorAll('.article-count')].find(x=>x.dataset.countLaw===law&&x.dataset.countA===a);if(c)c.textContent=exact.length?exact.length+'筆精準／'+rel.length+'筆相關':rel.length+'筆相關';let links=arr=>arr.slice(0,120).map(r=>`<a href="#" class="related-link gotoletter" data-id="${r.index}">#${String(r.index).padStart(4,'0')}｜${esc(r.rocDate)}｜${esc(r.docNo)}<small>${esc(r.subject||'')}</small></a>`).join('');let rulesHtml=relatedRules.length?`<div class="related-section rules-inline"><h3>相關施行細則 <span class="muted">${relatedRules.length}條</span></h3>${relatedRules.map(x=>`<div class="inline-rule"><h4>政府採購法施行細則 ${esc(displayArticleNo(x.no))}</h4><div class="inline-rule-text">${linkRefs(x.text)}</div></div>`).join('')}<div class="relation-note">本法與施行細則對照依人工確認對照表顯示。</div></div>`:'';let lawLinks=relatedLaws.length?`<div class="related-section"><h3>引用／關聯主管法規 <span class="muted">${relatedLaws.length}筆</span></h3>${relatedLaws.slice(0,80).map(l=>`<a href="#" class="related-link openlaw" data-lawname="${esc(l.name)}"><b>${esc(l.name)}</b><small>${esc(l.category)}｜${esc(l.updated||'')}</small></a>`).join('')}</div>`:'';$('#articleDetail').innerHTML=`<h2>${esc(law)} ${esc(displayArticleNo(ar.no))}</h2><div class="article-text">${linkRefs(ar.text)}</div>${rulesHtml}${lawLinks}<div class="related-section"><h3>PRMS原始法規依據－精準關聯 <span class="muted">${exact.length}筆</span></h3>${exact.length?links(exact):'<div class="empty">PRMS原始「根據」欄位目前無直接關聯</div>'}</div><div class="related-section"><h3>函釋全文提及－延伸關聯 <span class="muted">${mention.length}筆</span></h3>${mention.length?links(mention):'<div class="empty">目前無其他全文提及</div>'}</div>`}
function openDrawer(law,a){let ar=findArticle(law,a);$('#drawerTitle').textContent=`${law} 第${a.replace('-','條之')}條`;$('#drawerBody').innerHTML=ar?`<div class="article-text">${linkRefs(ar.text)}</div><p><a href="${esc(lawMap.get(law)?.url||'#')}" target="_blank">工程會法規原始頁面 ↗</a></p><div class="status">本站偵測相關函釋：${lettersFor(law,a).length}筆</div>`:`<div class="empty">145筆主管法規資料中未找到此條文。</div>`;$('#drawer').hidden=false;document.body.classList.add('drawer-open')}
function runLetterSearch(){let ts=tokens($('#lq').value),scope=$('#lscope').value;letterRows=LETTERS.filter(r=>ts.every(t=>norm(letterText(r,scope)).includes(t))).sort((a,b)=>$('#lsort').value==='new'?b.index-a.index:a.index-b.index);lshown=0;$('#lresults').innerHTML='';renderLetterMore()}
function renderLetterMore(){let part=letterRows.slice(lshown,lshown+PAGE);lshown+=part.length;$('#lstatus').className='status';$('#lstatus').textContent=`找到 ${letterRows.length.toLocaleString()} 筆函釋${letterRows.length>PAGE?`（目前顯示 ${lshown.toLocaleString()} 筆）`:''}`;if(!letterRows.length)$('#lresults').innerHTML='<div class="empty">沒有符合條件的函釋</div>';else $('#lresults').insertAdjacentHTML('beforeend',part.map(r=>renderLetter(r,tokens($('#lq').value),$('#lfull').checked)).join(''));$('#lmore').hidden=lshown>=letterRows.length}
function gotoLetter(id){showView('letters');let r=LETTERS.find(x=>x.index==id);if(!r)return;$('#lq').value=r.docNo||String(id);runLetterSearch();setTimeout(()=>$('#lresults .letter')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
Promise.all([fetch('./data/laws.json').then(r=>r.json()),fetch('./data/letters.json').then(r=>r.json()),fetch('./data/act_rules_map.json').then(r=>r.json()),fetch('./json/政府採購法.json').then(r=>r.json()),fetch('./json/政府採購法施行細則.json').then(r=>r.json())]).then(([l,d,m,actLaw,ruleLaw])=>{LAWS=l.records;LETTERS=d.records;ACT_RULES_MAP=m.map||{};normalizeLawDisplayData(LAWS);LAWS.forEach(x=>lawMap.set(x.name,x));normalizeLawDisplayData([actLaw,ruleLaw]);lawMap.set('政府採購法',actLaw);lawMap.set('政府採購法施行細則',ruleLaw);buildLawAliasPattern();let cats=[...new Set(LAWS.map(x=>x.category))];$('#category').innerHTML='<option value="">全部10類</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');runSearch();renderLaws();renderArticleList();runLetterSearch();buildRefIndexAsync()}).catch(e=>{$('#searchStatus').textContent='資料載入失敗。請使用 VS Code Live Server 或 GitHub Pages 開啟。';console.error(e)});
let timer;document.addEventListener('click',e=>{
let seg=e.target.closest('.article-law-seg');
if(seg){
  const law=seg.dataset.law;
  const sel=$('#articleLaw');
  if(sel && sel.value!==law){
    sel.value=law;
    document.querySelectorAll('.article-law-seg').forEach(b=>{const on=b.dataset.law===law;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    renderArticleList();
    $('#articleDetail').innerHTML='<div class="empty">請選擇條文</div>';
  }
  return;
}
let toggle=e.target.closest('.lawhits-toggle');if(toggle){let group=toggle.closest('.lawhits-group'),groups=[...group.querySelectorAll('.lawhit-law-group')],allOpen=groups.length&&groups.every(g=>!g.querySelector('.lawhit-law-body').hidden),opening=!allOpen,label=toggle.querySelector('.lawhits-toggle-label');groups.forEach(g=>{let body=g.querySelector('.lawhit-law-body'),btn=g.querySelector('.lawhit-law-toggle'),lab=g.querySelector('.lawhit-law-toggle-label');body.hidden=!opening;btn.setAttribute('aria-expanded',String(opening));g.classList.toggle('expanded',opening);g.classList.toggle('collapsed',!opening);if(lab)lab.textContent=opening?'▲ 收合':'▼ 展開'});toggle.setAttribute('aria-expanded',String(opening));group.classList.toggle('expanded',opening);group.classList.toggle('collapsed',!opening);if(label)label.textContent=opening?'▲ 全部收合':'▼ 全部展開';return;}let lawToggle=e.target.closest('.lawhit-law-toggle');if(lawToggle){let group=lawToggle.closest('.lawhit-law-group'),body=group?.querySelector('.lawhit-law-body'),label=lawToggle.querySelector('.lawhit-law-toggle-label');if(body){let opening=body.hidden;body.hidden=!opening;lawToggle.setAttribute('aria-expanded',String(opening));group.classList.toggle('expanded',opening);group.classList.toggle('collapsed',!opening);if(label)label.textContent=opening?'▲ 收合':'▼ 展開';}return;}let previewPoint=e.target.closest('.lawhit-point');if(previewPoint){e.preventDefault();openSearchLawPreview(previewPoint.dataset.lawname,previewPoint.dataset.target||'',previewPoint.dataset.targetkey||'',previewPoint.dataset.search||'');return;}let closePreview=e.target.closest('.search-preview-close');if(closePreview){$('#searchLawPreview').hidden=true;return;}let fullLaw=e.target.closest('.open-full-law');if(fullLaw){e.preventDefault();openLaw(fullLaw.dataset.fullLawname,fullLaw.dataset.fullTarget||'',fullLaw.dataset.fullTargetkey||'',fullLaw.dataset.fullSearch||'');return;}let t=e.target.closest('.tab');if(t)showView(t.dataset.view);let ln=e.target.closest('[data-lawname]');if(ln){e.preventDefault();openLaw(ln.dataset.lawname,ln.dataset.target||'',ln.dataset.targetkey||'',ln.dataset.search||'')}let ar=e.target.closest('.article-row');if(ar)selectArticle(ar.dataset.a);let lr=e.target.closest('.lawref');if(lr){e.preventDefault();openDrawer(lr.dataset.law,lr.dataset.a)}let gl=e.target.closest('.gotoletter');if(gl){e.preventDefault();gotoLetter(+gl.dataset.id)}});$('#q').oninput=()=>{clearTimeout(timer);timer=setTimeout(runSearch,140)};$('#scope').onchange=runSearch;$('#full').onchange=runSearch;$('#clear').onclick=()=>{$('#q').value='';runSearch()};$('#more').onclick=renderSearchMore;$('#lawq').oninput=renderLaws;$('#category').onchange=renderLaws;$('#backLaws').onclick=()=>showView('laws');$('#articleLaw').onchange=()=>{renderArticleList();$('#articleDetail').innerHTML='<div class="empty">請選擇條文</div>'};$('#lq').oninput=()=>{clearTimeout(timer);timer=setTimeout(runLetterSearch,140)};$('#lscope').onchange=runLetterSearch;$('#lsort').onchange=runLetterSearch;$('#lfull').onchange=runLetterSearch;$('#lclear').onclick=()=>{$('#lq').value='';runLetterSearch()};$('#lmore').onclick=renderLetterMore;$('#drawerClose').onclick=()=>{$('#drawer').hidden=true;document.body.classList.remove('drawer-open')};
