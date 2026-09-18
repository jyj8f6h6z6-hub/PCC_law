let LETTERS=[],LAWS=[],lawMap=new Map(),shown=0,lshown=0,searchLetterRows=[],letterRows=[],LETTER_REF_CACHE=new Map(),REF_INDEX=new Map(),REF_INDEX_READY=false;const PAGE=40,$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').toLowerCase().replace(/[\s　]+/g,' ').trim(); const tokens=s=>norm(s).split(' ').filter(Boolean); const reEsc=s=>String(s??'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function lawText(l){return [l.name,l.category,l.published,l.updated,l.fullText,...l.articles.flatMap(a=>[a.no,a.text])].join('\n')}
function letterText(r,scope='all'){if(scope==='basis')return r.basis||'';if(scope==='subject')return r.subject||'';if(scope==='body')return r.body||'';return [r.basis,r.subject,r.body,r.docNo,r.issuer,r.pkPrmsRuleContent].join(' ')}
function hi(s,ts){let x=esc(s);for(const t of ts){let p=esc(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(p)x=x.replace(new RegExp(p,'gi'),m=>`<mark>${m}</mark>`)}return x}
function key(law,no){return `${law}|${String(no).replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'')}`}
function findArticle(law,no){let l=lawMap.get(law);if(!l)return null;let n=String(no).replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'');return l.articles.find(a=>a.no.replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'')===n)}
let _lawAliasPattern='';
function buildLawAliasPattern(){
  const aliases=[];
  for(const l of LAWS){if(l?.name)aliases.push(l.name)}
  aliases.push('採購法施行細則','採購法');
  const uniq=[...new Set(aliases)].sort((a,b)=>b.length-a.length);
  _lawAliasPattern=uniq.map(reEsc).join('|');
}
function canonicalLawName(alias){
  if(alias==='採購法')return '政府採購法';
  if(alias==='採購法施行細則')return '政府採購法施行細則';
  return alias;
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
  // 「同法／同辦法／本法／本辦法」或同一串列後續「第57條」繼承最近法規。
  const chained=/(同法|同辦法|本法|本辦法)?[\s　、，,；;及與和或]*第\s*(\d{1,3})(?:\s*條\s*之\s*(\d+)|\s*條|\s*之\s*(\d+)\s*條?)/g;
  while((m=chained.exec(text))){
    if(covered.some(([a,b])=>m.index>=a&&m.index<b))continue;
    const prev=out.filter(x=>x.start<m.index).sort((a,b)=>b.start-a.start)[0];
    if(!prev)continue;
    if(!m[1] && m.index-prev.end>80)continue;
    const a=m[2]+((m[3]||m[4])?'-'+(m[3]||m[4]):'');
    if(findArticle(prev.law,a)) out.push({law:prev.law,a,start:m.index,end:chained.lastIndex,explicit:false});
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
function buildRefIndexAsync(){REF_INDEX.clear();REF_INDEX_READY=false;let i=0;const chunk=()=>{let end=Math.min(i+40,LETTERS.length);for(;i<end;i++){let r=LETTERS[i];for(const x of letterRefs(r)){let k=x.law+'|'+x.a,arr=REF_INDEX.get(k);if(!arr)REF_INDEX.set(k,arr=[]);if(!arr.includes(r.index))arr.push(r.index)}}if(i<LETTERS.length){setTimeout(chunk,0)}else{REF_INDEX_READY=true;refreshVisibleArticleCounts()}};setTimeout(chunk,0)}
function refreshVisibleArticleCounts(){document.querySelectorAll('.article-count').forEach(c=>{let ids=REF_INDEX.get(c.dataset.countLaw+'|'+c.dataset.countA)||[];c.textContent=ids.length+'筆函釋'})}
function lawsForAct(a){return LAWS.filter(l=>l.name!=='政府採購法'&&actRefsForLaw(l).includes(a))}
function renderLetter(r,ts=[],full=true){return `<article class="letter" id="letter-${r.index}"><div class="meta"><span class="idx">#${String(r.index).padStart(4,'0')}</span><span>${esc(r.rocDate)}</span><span>${hi(r.docNo,ts)}</span><span>${esc(r.issuer)}</span></div><div class="subject">${hi(r.subject||'(無主旨)',ts)}</div><div class="basis"><b>PRMS原始法規依據：</b>${linkRefs(r.basis||'—',ts)}</div>${full?`<div class="body">${linkRefs(r.body||'',ts)}</div>`:''}<div class="actions"><a href="${esc(r.url)}" target="_blank" rel="noopener">工程會原文 ↗</a></div></article>`}
function showView(v){document.querySelectorAll('.view').forEach(x=>x.hidden=true);document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#'+v+'View').hidden=false;if(v==='laws')renderLaws();if(v==='articles')renderArticleList();if(v==='letters'&&!letterRows.length)runLetterSearch()}
function runSearch(){let ts=tokens($('#q').value),scope=$('#scope').value;let lh=scope==='letters'?[]:LAWS.filter(l=>ts.length&&ts.every(t=>norm(lawText(l)).includes(t))).slice(0,40);searchLetterRows=scope==='laws'?[]:LETTERS.filter(r=>ts.length&&ts.every(t=>norm(letterText(r)).includes(t))).sort((a,b)=>b.index-a.index);shown=0;$('#lawHits').innerHTML=lh.length?`<div class="status">主管法規找到 ${lh.length}${lh.length===40?'＋':''} 筆</div>`+lh.map(l=>`<button class="lawhit" data-lawname="${esc(l.name)}"><b>${hi(l.name,ts)}</b><small>${esc(l.category)}｜最新異動：${esc(l.updated||'—')}｜${l.articles.length?l.articles.length+'個條文':'全文式'}</small></button>`).join(''):'';$('#letterHits').innerHTML='';renderSearchMore();$('#searchStatus').className='status';$('#searchStatus').textContent=ts.length?`搜尋「${$('#q').value}」`:'請輸入關鍵字搜尋145筆主管法規與3,666筆函釋';}
function renderSearchMore(){if(!tokens($('#q').value).length){$('#more').hidden=true;return}let part=searchLetterRows.slice(shown,shown+PAGE);shown+=part.length;if(part.length)$('#letterHits').insertAdjacentHTML('beforeend',(shown===part.length?`<div class="status">函釋找到 ${searchLetterRows.length.toLocaleString()} 筆</div>`:'')+part.map(r=>renderLetter(r,tokens($('#q').value),$('#full').checked)).join(''));$('#more').hidden=shown>=searchLetterRows.length}
function renderLaws(){let q=norm($('#lawq').value),cat=$('#category').value,arr=LAWS.filter(l=>(!cat||l.category===cat)&&(!q||norm(lawText(l)).includes(q)));$('#lawsCount').className='status';$('#lawsCount').textContent=`共 ${arr.length} 筆`;let groups={};arr.forEach(l=>(groups[l.category]??=[]).push(l));$('#lawsList').innerHTML=Object.entries(groups).map(([c,ls])=>`<div class="catgroup"><h3>${esc(c)} <span class="muted">${ls.length}筆</span></h3>${ls.map(l=>`<div class="lawrow"><div><div class="lawname" data-lawname="${esc(l.name)}">${esc(l.name)}</div><div class="lawmeta">公發布：${esc(l.published||'—')}　｜　最新異動：${esc(l.updated||'—')}　｜　${l.articles.length?`${l.articles.length}個條文`:'全文式資料'}</div></div><span class="pill">${esc(l.dataType||'法規')}</span></div>`).join('')}</div>`).join('')||'<div class="empty">沒有符合條件的法規</div>'}
function openLaw(name){let l=lawMap.get(name);if(!l)return;showView('lawDetail');let content=l.articles.length?l.articles.map(a=>`<section class="law-article" id="${esc(name)}-${esc(a.no)}"><h3>${esc(a.no)}</h3><div class="txt">${linkRefs(a.text)}</div></section>`).join(''):`<div class="fulltext">${linkRefs(l.fullText||'（無全文內容）')}</div>`;$('#lawDetail').innerHTML=`<div class="lawdetail-head"><h2>${esc(l.name)}</h2><div class="lawmeta">${esc(l.category)}<br>公發布：${esc(l.published||'—')}　｜　最新異動：${esc(l.updated||'—')}　｜　資料型態：${esc(l.dataType||'—')}</div><a class="official" href="${esc(l.url)}" target="_blank" rel="noopener">工程會法規原始頁面 ↗</a></div>${content}`;scrollTo(0,0)}
function renderArticleList(){let name=$('#articleLaw').value,l=lawMap.get(name);if(!l)return;$('#articleList').innerHTML=`<b>${esc(name)}</b>`+l.articles.map(a=>{let n=a.no.replace(/^第/,'').replace(/條之/g,'-').replace(/條/g,'');return `<button class="article-row" data-a="${n}"><span>${esc(a.no)}</span><small class="article-count" data-count-law="${esc(name)}" data-count-a="${esc(n)}">${REF_INDEX_READY?((REF_INDEX.get(name+'|'+n)||[]).length+'筆函釋'):'計算中…'}</small></button>`}).join('');if(REF_INDEX_READY)refreshVisibleArticleCounts()}
function selectArticle(a){let law=$('#articleLaw').value,ar=findArticle(law,a);if(!ar)return;document.querySelectorAll('.article-row').forEach(x=>x.classList.toggle('selected',x.dataset.a===a));let rel=lettersFor(law,a).sort((x,y)=>y.index-x.index),relatedLaws=law==='政府採購法'?lawsForAct(a):[];let c=[...document.querySelectorAll('.article-count')].find(x=>x.dataset.countLaw===law&&x.dataset.countA===a);if(c)c.textContent=rel.length+'筆函釋';$('#articleDetail').innerHTML=`<h2>${esc(law)} ${esc(ar.no)}</h2><div class="article-text">${linkRefs(ar.text)}</div><div class="related-section"><h3>引用／關聯主管法規 <span class="muted">${relatedLaws.length}筆</span></h3>${relatedLaws.length?relatedLaws.slice(0,80).map(l=>`<a href="#" class="related-link openlaw" data-lawname="${esc(l.name)}"><b>${esc(l.name)}</b><small>${esc(l.category)}｜${esc(l.updated||'')}</small></a>`).join(''):'<div class="empty">目前未由145筆法規全文偵測到引用</div>'}</div><div class="related-section"><h3>相關函釋 <span class="muted">${rel.length}筆</span></h3>${rel.length?rel.slice(0,120).map(r=>`<a href="#" class="related-link gotoletter" data-id="${r.index}">#${String(r.index).padStart(4,'0')}｜${esc(r.rocDate)}｜${esc(r.docNo)}<small>${esc(r.subject||'')}</small></a>`).join(''):'<div class="empty">目前未偵測到相關函釋</div>'}</div>`}
function openDrawer(law,a){let ar=findArticle(law,a);$('#drawerTitle').textContent=`${law} 第${a.replace('-','條之')}條`;$('#drawerBody').innerHTML=ar?`<div class="article-text">${linkRefs(ar.text)}</div><p><a href="${esc(lawMap.get(law)?.url||'#')}" target="_blank">工程會法規原始頁面 ↗</a></p><div class="status">本站偵測相關函釋：${lettersFor(law,a).length}筆</div>`:`<div class="empty">145筆主管法規資料中未找到此條文。</div>`;$('#drawer').hidden=false;document.body.classList.add('drawer-open')}
function runLetterSearch(){let ts=tokens($('#lq').value),scope=$('#lscope').value;letterRows=LETTERS.filter(r=>ts.every(t=>norm(letterText(r,scope)).includes(t))).sort((a,b)=>$('#lsort').value==='new'?b.index-a.index:a.index-b.index);lshown=0;$('#lresults').innerHTML='';renderLetterMore()}
function renderLetterMore(){let part=letterRows.slice(lshown,lshown+PAGE);lshown+=part.length;$('#lstatus').className='status';$('#lstatus').textContent=`找到 ${letterRows.length.toLocaleString()} 筆函釋${letterRows.length>PAGE?`（目前顯示 ${lshown.toLocaleString()} 筆）`:''}`;if(!letterRows.length)$('#lresults').innerHTML='<div class="empty">沒有符合條件的函釋</div>';else $('#lresults').insertAdjacentHTML('beforeend',part.map(r=>renderLetter(r,tokens($('#lq').value),$('#lfull').checked)).join(''));$('#lmore').hidden=lshown>=letterRows.length}
function gotoLetter(id){showView('letters');let r=LETTERS.find(x=>x.index==id);if(!r)return;$('#lq').value=r.docNo||String(id);runLetterSearch();setTimeout(()=>$('#lresults .letter')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
Promise.all([fetch('./data/laws.json').then(r=>r.json()),fetch('./data/letters.json').then(r=>r.json())]).then(([l,d])=>{LAWS=l.records;LETTERS=d.records;LAWS.forEach(x=>lawMap.set(x.name,x));buildLawAliasPattern();let cats=[...new Set(LAWS.map(x=>x.category))];$('#category').innerHTML='<option value="">全部10類</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');runSearch();renderLaws();renderArticleList();runLetterSearch();buildRefIndexAsync()}).catch(e=>{$('#searchStatus').textContent='資料載入失敗。請使用 VS Code Live Server 或 GitHub Pages 開啟。';console.error(e)});
let timer;document.addEventListener('click',e=>{let t=e.target.closest('.tab');if(t)showView(t.dataset.view);let ln=e.target.closest('[data-lawname]');if(ln){e.preventDefault();openLaw(ln.dataset.lawname)}let ar=e.target.closest('.article-row');if(ar)selectArticle(ar.dataset.a);let lr=e.target.closest('.lawref');if(lr){e.preventDefault();openDrawer(lr.dataset.law,lr.dataset.a)}let gl=e.target.closest('.gotoletter');if(gl){e.preventDefault();gotoLetter(+gl.dataset.id)}});$('#q').oninput=()=>{clearTimeout(timer);timer=setTimeout(runSearch,140)};$('#scope').onchange=runSearch;$('#full').onchange=runSearch;$('#clear').onclick=()=>{$('#q').value='';runSearch()};$('#more').onclick=renderSearchMore;$('#lawq').oninput=renderLaws;$('#category').onchange=renderLaws;$('#backLaws').onclick=()=>showView('laws');$('#articleLaw').onchange=()=>{renderArticleList();$('#articleDetail').innerHTML='<div class="empty">請選擇條文</div>'};$('#lq').oninput=()=>{clearTimeout(timer);timer=setTimeout(runLetterSearch,140)};$('#lscope').onchange=runLetterSearch;$('#lsort').onchange=runLetterSearch;$('#lfull').onchange=runLetterSearch;$('#lclear').onclick=()=>{$('#lq').value='';runLetterSearch()};$('#lmore').onclick=renderLetterMore;$('#drawerClose').onclick=()=>{$('#drawer').hidden=true;document.body.classList.remove('drawer-open')};
