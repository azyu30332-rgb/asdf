import {makeVolumes, seriesStatus, validateBackup, selectBooks} from './model.mjs';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'chaekjang.collection.v1';
let books = [], demo = false, filter = 'all', page = 1, currentId = null, storageBlocked = false;
let toastTimer;
function toast(message) { $('#toast').textContent=message; $('#toast').style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').style.display='none',3500); }
try { const saved=localStorage.getItem(KEY); if(saved) books=validateBackup(JSON.parse(saved)); } catch { storageBlocked=true; setTimeout(()=>toast('저장 데이터를 읽지 못했어요. 백업 파일을 확인하거나 복원해 주세요.'),300); }
function persist(next) {
  if(demo){books=next;render();return true;}
  if(storageBlocked){toast('기존 데이터를 보호하기 위해 저장을 중단했어요. 백업 복원 후 다시 시도해 주세요.');return false;}
  try{ localStorage.setItem(KEY,JSON.stringify({version:1,books:next})); books=next;render();return true;}catch{toast('저장 공간이 부족하거나 브라우저 저장이 차단되어 있어요. 백업 후 확인해 주세요.');return false;}
}
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; }
const colors=['#225c51','#d17b47','#3f5574','#b05b58','#78643f','#51515e','#55807e','#777646'];
function color(title){return colors[Array.from(title).reduce((s,c)=>s+c.codePointAt(0),0)%colors.length];}
function badge(status){return el('span','badge '+(status==='거래중'?'trading':status==='거래완료'?'sold':''),status);}
function range(volumes){ const ns=volumes.map(v=>v.number).sort((a,b)=>a-b);return ns.length===1?`${ns[0]}권`:`${ns[0]}–${ns.at(-1)}권${ns.length!==ns.at(-1)-ns[0]+1?' · 일부 권 제외':''}`; }
function render(){
  const counts={'보유중':0,'거래중':0,'거래완료':0}; books.forEach(b=>b.volumes.forEach(v=>counts[v.status]++));
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  for(const [id,n] of Object.entries({total,owned:counts['보유중'],trading:counts['거래중'],sold:counts['거래완료']})){const nEl=$('#'+id);nEl.replaceChildren(document.createTextNode(n.toLocaleString()),el('small','', '권'));}
  $('#side-count').textContent=books.length;$('#series-count').textContent=`${books.length.toLocaleString()}개의 시리즈와 함께하고 있어요`;
  const matches=selectBooks(books,filter,$('#search').value,$('#sort').value);$('#result-count').textContent=matches.length;
  const pages=Math.max(1,Math.ceil(matches.length/12));page=Math.min(page,pages);$('#list').replaceChildren();
  matches.slice((page-1)*12,page*12).forEach(b=>{
    const status=seriesStatus(b),card=el('article','book-card'+(status==='거래중'?' is-trading':''));
    card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${b.title} 상세 및 권별 상태 관리`);
    const top=el('div','card-top'),cover=el('div','cover'); cover.style.background=color(b.title);cover.setAttribute('aria-hidden','true');cover.append(el('span','','MANGA'),el('b','',b.title),el('small','','MY COLLECTION'));
    const info=el('div','card-info');info.append(badge(status),el('h3','',b.title),el('p','author',b.author||'작가 미등록'));
    const r=el('div','range',range(b.volumes));r.append(el('b','',`총 ${b.volumes.length}권`));info.append(r);top.append(cover,info);
    const note=el('p','card-note','✎  '+(b.note||'남겨진 메모가 없어요.'));note.title=b.note;
    const bottom=el('div','card-bottom');const trading=b.volumes.filter(v=>v.status==='거래중').length; const sold=b.volumes.filter(v=>v.status==='거래완료').length;
    bottom.append(el('span','',trading?`${trading}권 거래중${sold?` · ${sold}권 거래완료`:''}`:sold?`${sold}권 거래완료`:'소중히 보관중'),el('span','','상세 보기 →'));card.append(top,note,bottom);
    card.addEventListener('click',()=>openDetail(b.id));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(b.id);}});$('#list').append(card);
  });
  $('#empty').hidden=!!matches.length;
  if(!matches.length){$('#empty h2').textContent=books.length?'검색 결과가 없어요':'첫 번째 이야기를 꽂아보세요';$('#empty p').textContent=books.length?'다른 검색어나 상태 필터를 사용해 보세요.':'시리즈 제목과 권수만 입력하면 한 번에 등록할 수 있어요.';$('#empty-add').hidden=!!books.length;}
  $('#page-info').textContent=matches.length?`총 ${matches.length}개 시리즈 중 ${(page-1)*12+1}–${Math.min(page*12,matches.length)} · ${page} / ${pages} 페이지`:'';
  $('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
  $$('#demo-label').forEach(n=>n.textContent=demo?'샘플 보기 · 실제 데이터와 별도':'' );$('#demo').textContent=demo?'내 컬렉션으로 돌아가기':'샘플 둘러보기';$('#backup').disabled=demo;$('#restore').disabled=demo;
  $$('[data-filter]').forEach(b=>{const active=b.dataset.filter===filter;b.classList.toggle(b.classList.contains('nav')?'active':'selected',active);b.setAttribute('aria-pressed',String(active));});
}
function add(){ $('#book-form').reset();$('#form-error').textContent='';$('#editor').showModal(); }
$('#add').onclick=add;$('#empty-add').onclick=add;
$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#book-form').onsubmit=e=>{
  e.preventDefault(); const f=new FormData(e.currentTarget);
  try{const title=f.get('title').trim();if(!title)throw Error('시리즈 제목을 입력해 주세요.');const volumes=makeVolumes(Number(f.get('from')),Number(f.get('to')),f.get('missing'),f.get('status'));
    if(books.some(b=>b.title.toLocaleLowerCase()===title.toLocaleLowerCase()&&b.volumes.some(v=>volumes.some(n=>n.number===v.number))))throw Error('같은 제목에 중복되는 권이 있어요. 기존 시리즈를 확인해 주세요.');
    const b={id:crypto.randomUUID(),title,author:f.get('author').trim(),volumes,note:f.get('note').trim(),createdAt:Date.now()};
    if(persist([...books,b])){$('#editor').close();toast(`${volumes.length}권을 등록했어요.${demo?' (샘플 모드)':''}`);}
  }catch(err){$('#form-error').textContent=err.message;}
};
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;page=1;render();});
$('#search').oninput=()=>{page=1;render();};$('#sort').onchange=()=>{page=1;render();};
$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$$('dialog').some(d=>d.open)){e.preventDefault();$('#search').focus();}});
function openDetail(id){currentId=id;const b=books.find(b=>b.id===id);$('#detail-title').textContent=b.title;$('#detail-author').textContent=`${b.author||'작가 미등록'} · ${range(b.volumes)} · 총 ${b.volumes.length}권`;$('#detail-note').value=b.note;renderVolumes(b);$('#detail').showModal();}
function renderVolumes(b){$('#volumes').replaceChildren();b.volumes.forEach(v=>{const l=el('label','volume '+(v.status==='거래중'?'trading':v.status==='거래완료'?'sold':''));const input=el('input');input.type='checkbox';input.value=v.number;input.setAttribute('aria-label',`${v.number}권 · ${v.status}`);l.append(input,el('span','',`${v.number}권 · ${v.status}`));$('#volumes').append(l);});}
$('#select-all').onclick=()=>{const all=$$('#volumes input');const checked=all.some(n=>!n.checked);all.forEach(n=>n.checked=checked);};
$('#apply').onclick=()=>{const selected=new Set($$('#volumes input:checked').map(n=>Number(n.value)));if(!selected.size){toast('상태를 변경할 권을 먼저 선택해 주세요.');return;}
 const status=$('#bulk-status').value;const next=books.map(b=>b.id===currentId?{...b,volumes:b.volumes.map(v=>selected.has(v.number)?{...v,status}:v)}:b);
 if(persist(next)){renderVolumes(books.find(b=>b.id===currentId));toast(`${selected.size}권을 ${status}(으)로 변경했어요.`);}
};
$('#save-note').onclick=()=>{if(persist(books.map(b=>b.id===currentId?{...b,note:$('#detail-note').value}:b))){$('#detail').close();toast('메모를 저장했어요.');}};
$('#delete').onclick=()=>{const b=books.find(b=>b.id===currentId);if(confirm(`「${b.title}」 ${b.volumes.length}권을 삭제할까요? 삭제 전 백업을 권장해요.`)&&persist(books.filter(b=>b.id!==currentId))){$('#detail').close();toast('시리즈를 삭제했어요.');}};
$('#backup').onclick=()=>{if(window.ChaekjangNative){window.ChaekjangNative.exportBackup(JSON.stringify({version:1,exportedAt:new Date().toISOString(),books}),'');return;}const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),books},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=`책장-백업-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('백업 파일을 다운로드했어요. 안전하게 보관해 주세요.');};
function restoreText(text) {
  try {
    const restored=validateBackup(JSON.parse(text));
    if(!confirm(`현재 목록을 백업의 ${restored.length}개 시리즈로 교체할까요? 기존 데이터는 덮어씁니다.`))return;
    try{localStorage.setItem(KEY,JSON.stringify({version:1,books:restored}));}catch{throw Error('기기 저장에 실패했어요. 기존 데이터는 변경하지 않았어요.');}
    books=restored;storageBlocked=false;page=1;render();toast('백업을 복원했어요.');
  }catch(err){toast(err instanceof SyntaxError?'올바른 JSON 백업 파일을 선택해 주세요.':err.message);}
}
$('#restore').onclick=()=>{if(window.ChaekjangNative){window.ChaekjangNative.importBackup();return;}$('#file').click();};
$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('20MB 이하의 백업 파일을 선택해 주세요.');restoreText(await file.text());}catch(err){toast(err.message);}finally{e.target.value='';}};
window.addEventListener('chaekjang-restore',e=>{if(!demo&&typeof e.detail==='string')restoreText(e.detail);});
window.addEventListener('chaekjang-message',e=>{if(typeof e.detail==='string')toast(e.detail);});
if(window.ChaekjangNative){
  document.body.classList.add('android-app');
  $('.sidebar-bottom small').innerHTML='데이터는 이 휴대폰에 저장됩니다.<br>앱 삭제 전 꼭 백업해 주세요.';
  $('header>span').textContent='나의 만화책장 · 오프라인';
  $('footer span').textContent='이 휴대폰에 저장됩니다 · 앱 삭제 전 꼭 백업하세요.';
}
let realBooks;
$('#demo').onclick=()=>{if(demo){books=realBooks;demo=false;}else{realBooks=books;demo=true;books=[['슬램덩크','이노우에 다케히코',31,'거래중','전권 세트 · 중고나라 문의 답변하기. 모서리 상태 사진 전달 예정.'],['원피스','오다 에이치로',108,'보유중','1–60권은 거실 책장, 나머지는 서재에 보관.'],['귀멸의 칼날','고토게 코요하루',23,'거래중','완결 세트 / 택배비 포함 75,000원.'],['명탐정 코난','아오야마 고쇼',105,'보유중','초판 일부 포함. 책장 두 번째 칸.'],['하이큐!!','후루다테 하루이치',45,'보유중','전권 완결 · 가장 아끼는 시리즈.'],['강철의 연금술사','아라카와 히로무',27,'거래완료','전권 판매 완료. 다음 독자에게 잘 도착!'],['진격의 거인','이사야마 하지메',34,'보유중','완결권까지 모두 소장.'],['스파이 패밀리','엔도 타츠야',13,'보유중','다음 권 구매 예정.'],['나루토','키시모토 마사시',72,'보유중','책등 햇빛 노출 주의.']].map(([title,author,to,status,note],i)=>({id:`demo-${i}`,title,author,volumes:makeVolumes(1,to,'',status),note,createdAt:Date.now()-i*1000}));}page=1;filter='all';$('#search').value='';render();};
window.addEventListener('storage',e=>{if(e.key===KEY&&!demo){try{books=e.newValue?validateBackup(JSON.parse(e.newValue)):[];render();toast('다른 창의 변경사항을 반영했어요.');}catch{toast('다른 창의 데이터를 읽지 못했어요.');}}});
render();
