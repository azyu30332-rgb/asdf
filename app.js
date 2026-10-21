import {makeVolumes, seriesStatus, validateBackup, selectBooks, changeStatus, localDay, isDay, validPhoto, MAX_BACKUP_BYTES, MAX_PHOTO_LENGTH} from './model.mjs';
import {loadCollection, saveCollection} from './storage.mjs';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let books=[], demo=false, realBooks=[], filter='all', page=1, currentId=null, ready=false, storageBlocked=false, saveBusy=false;
let toastTimer, photoRequest=null;
const draftPhotos={editor:null,detail:null};
const themes=['forest','cream','blue','dark'];
const android = () => !!window.ChaekjangNative;
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',5000);}
function setTheme(theme,persistChoice=false){
  if(!themes.includes(theme))theme='forest';
  document.body.dataset.theme=theme;
  try{if(typeof window.ChaekjangNative?.setTheme==='function')window.ChaekjangNative.setTheme(theme);}catch{}
  $$('[data-theme-option]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeOption===theme)));
  if(persistChoice)try{localStorage.setItem('chaekjang.theme',theme);}catch{toast('테마는 적용했지만 기기에 저장하지 못했어요.');}
}
try{setTheme(localStorage.getItem('chaekjang.theme')||'forest');}catch{setTheme('forest');}
$('#theme-settings').onclick=()=>$('#themes-dialog').showModal();
$$('[data-theme-option]').forEach(b=>b.onclick=()=>setTheme(b.dataset.themeOption,true));
function canUse(){if(!ready){toast('목록을 불러오는 중이에요. 잠시 후 다시 눌러 주세요.');return false;}if(storageBlocked){toast('목록을 읽지 못했어요. 기존 데이터를 보호하고 있으니 앱을 다시 열거나 백업을 복원해 주세요.');return false;}return true;}
async function persist(next){
  if(saveBusy){toast('저장 중이에요. 잠시 기다려 주세요.');return false;}
  if(demo){books=next;render();return true;}
  if(!canUse())return false;
  saveBusy=true;
  try{await saveCollection(next);books=next;render();return true;}
  catch{toast('기기에 저장하지 못했어요. 저장 공간을 확인해 주세요. 기존 목록은 유지했어요.');return false;}
  finally{saveBusy=false;}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
const colors=['#225c51','#d17b47','#3f5574','#b05b58','#78643f','#51515e','#55807e','#777646'];
function color(title){return colors[Array.from(title).reduce((s,c)=>s+c.codePointAt(0),0)%colors.length];}
function badge(status){return el('span','badge '+(status==='거래중'?'trading':status==='거래완료'?'sold':''),status);}
function range(volumes){const ns=volumes.map(v=>v.number).sort((a,b)=>a-b);return ns.length===1?`${ns[0]}권`:`${ns[0]}–${ns.at(-1)}권${ns.length!==ns.at(-1)-ns[0]+1?' · 일부 제외':''}`;}
function dateLabel(day){return day.replaceAll('-','.');}
function saleSummary(b){
  const sold=b.volumes.filter(v=>v.status==='거래완료');if(!sold.length)return '';
  const dates=sold.map(v=>v.soldAt).filter(Boolean).sort();
  const unknown=sold.some(v=>!v.soldAt);
  return dates.length?`${dates[0]===dates.at(-1)?'판매':'최근 판매'} ${dateLabel(dates.at(-1))}${unknown?' · 일부 판매일 미기록':''}`:'판매일 미기록';
}
function makeCover(b){
  const cover=el('div','cover');cover.style.background=color(b.title);cover.setAttribute('aria-hidden','true');
  if(b.photo){cover.classList.add('has-photo');const img=el('img');img.src=b.photo;img.alt='';img.loading='lazy';cover.append(img);}
  else cover.append(el('span','','MANGA'),el('b','',b.title),el('small','','MY COLLECTION'));
  return cover;
}
function render(){
  const counts={'보유중':0,'거래중':0,'거래완료':0};books.forEach(b=>b.volumes.forEach(v=>counts[v.status]++));
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  for(const [id,n] of Object.entries({total,owned:counts['보유중'],trading:counts['거래중'],sold:counts['거래완료']}))$('#'+id).replaceChildren(document.createTextNode(n.toLocaleString()),el('small','','권'));
  $('#side-count').textContent=books.length;$('#series-count').textContent=`${books.length.toLocaleString()}개의 시리즈`;
  const matches=selectBooks(books,filter,$('#search').value,$('#sort').value);$('#result-count').textContent=matches.length;
  const pages=Math.max(1,Math.ceil(matches.length/12));page=Math.max(1,Math.min(page,pages));$('#list').replaceChildren();
  matches.slice((page-1)*12,page*12).forEach(b=>{
    const status=seriesStatus(b),card=el('article','book-card'+(status==='거래중'?' is-trading':''));
    card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${b.title} 상세 및 권별 상태 관리`);
    const top=el('div','card-top'),info=el('div','card-info');info.append(badge(status),el('h3','',b.title),el('p','author',b.author||'작가 미등록'));
    const r=el('div','range',range(b.volumes));r.append(el('b','',`총 ${b.volumes.length}권`));info.append(r);top.append(makeCover(b),info);
    const note=el('p','card-note','✎ '+(b.note||'남겨진 메모가 없어요.'));note.title=b.note;
    const dates=el('div','card-dates');dates.append(el('span','',`등록 ${dateLabel(localDay(new Date(b.createdAt)))}`));if(saleSummary(b))dates.append(el('span','',saleSummary(b)));
    const trading=b.volumes.filter(v=>v.status==='거래중').length,sold=b.volumes.filter(v=>v.status==='거래완료').length,bottom=el('div','card-bottom');
    bottom.append(el('span','',trading?`${trading}권 거래중${sold?` · ${sold}권 판매`:''}`:sold?`${sold}권 거래완료`:'소중히 보관중'),el('span','','상세 보기 →'));card.append(top,note,dates,bottom);
    card.onclick=()=>openDetail(b.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(b.id);}};$('#list').append(card);
  });
  $('#empty').hidden=!!matches.length||!ready||storageBlocked;
  if(!matches.length){$('#empty h2').textContent=books.length?'검색 결과가 없어요':'첫 번째 이야기를 꽂아보세요';$('#empty p').textContent=books.length?'다른 검색어나 상태 필터를 사용해 보세요.':'제목과 권수를 입력하면 한 번에 등록할 수 있어요.';$('#empty-add').hidden=!!books.length;}
  $('#page-info').textContent=matches.length?`총 ${matches.length}개 · ${page}/${pages} 페이지`:'';
  $('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
  $('#demo-label').textContent=demo?'샘플 보기 · 실제 목록과 별도':'';$('#demo').textContent=demo?'내 컬렉션으로 돌아가기':'샘플 둘러보기';
  $$('[data-filter]').forEach(b=>{const active=b.dataset.filter===filter;b.classList.toggle(b.classList.contains('nav')?'active':'selected',active);b.setAttribute('aria-pressed',String(active));});
}
function showPhoto(target,photo){draftPhotos[target]=photo;const img=$(`#${target}-preview img`);img.hidden=!photo;if(photo)img.src=photo;else img.removeAttribute('src');}
function add(){if(!canUse())return;$('#book-form').reset();$('#form-error').textContent='';$('#book-form [name=registeredOn]').value=localDay();$('#book-form [name=registeredOn]').max=localDay();$('#book-form [name=soldOn]').value=localDay();$('#initial-sale').hidden=true;showPhoto('editor',null);$('#editor').showModal();}
$('#add').onclick=add;$('#empty-add').onclick=add;
$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#book-form [name=status]').onchange=e=>$('#initial-sale').hidden=e.target.value!=='거래완료';
$('#book-form').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),submit=$('#book-form button[type=submit]');
  try{
    if(photoRequest?.target==='editor')throw Error('사진을 처리 중이에요. 잠시 기다려 주세요.');
    const title=f.get('title').trim();if(!title)throw Error('시리즈 제목을 입력해 주세요.');
    const volumes=makeVolumes(Number(f.get('from')),Number(f.get('to')),f.get('missing'),f.get('status'),f.get('soldOn'));
    const numbers=new Set(volumes.map(v=>v.number));if(books.some(b=>b.title.toLocaleLowerCase()===title.toLocaleLowerCase()&&b.volumes.some(v=>numbers.has(v.number))))throw Error('같은 제목에 중복되는 권이 있어요. 기존 시리즈를 확인해 주세요.');
    const registeredOn=f.get('registeredOn');if(!isDay(registeredOn)||registeredOn>localDay())throw Error('등록일을 오늘 또는 이전 날짜로 입력해 주세요.');
    const b={id:crypto.randomUUID(),title,author:f.get('author').trim(),volumes,note:f.get('note').trim(),createdAt:registeredOn===localDay()?Date.now():new Date(`${registeredOn}T12:00:00`).getTime(),photo:draftPhotos.editor};
    submit.disabled=true;if(await persist([...books,b])){$('#editor').close();toast(`${volumes.length}권을 등록했어요.${demo?' (샘플)':''}`);}
  }catch(err){$('#form-error').textContent=err.message;}finally{submit.disabled=false;}
};
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;page=1;render();});
$('#search').oninput=()=>{page=1;render();};$('#sort').onchange=()=>{page=1;render();};$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$$('dialog').some(d=>d.open)){e.preventDefault();$('#search').focus();}});
function updateDetailDates(b){$('#detail-dates').textContent=`등록일 ${dateLabel(localDay(new Date(b.createdAt)))}${saleSummary(b)?' · '+saleSummary(b):''}`;}
function openDetail(id){
  currentId=id;const b=books.find(b=>b.id===id);$('#detail-title').textContent=b.title;$('#detail-author').textContent=`${b.author||'작가 미등록'} · ${range(b.volumes)} · 총 ${b.volumes.length}권`;
  updateDetailDates(b);$('#detail-note').value=b.note;showPhoto('detail',b.photo||null);$('#bulk-status').value='보유중';$('#sale-controls').hidden=true;$('#sold-on').value=localDay();$('#replace-sold-date').checked=false;renderVolumes(b);$('#detail').showModal();
}
function renderVolumes(b){$('#volumes').replaceChildren();b.volumes.forEach(v=>{
  const l=el('label','volume '+(v.status==='거래중'?'trading':v.status==='거래완료'?'sold':'')),input=el('input');input.type='checkbox';input.value=v.number;input.setAttribute('aria-label',`${v.number}권 · ${v.status}`);
  const span=el('span','',`${v.number}권 · ${v.status}`);if(v.status==='거래완료')span.append(el('small','',v.soldAt?`판매 ${dateLabel(v.soldAt)}`:'판매일 미기록'));l.append(input,span);$('#volumes').append(l);
});}
$('#select-all').onclick=()=>{const all=$$('#volumes input'),checked=all.some(n=>!n.checked);all.forEach(n=>n.checked=checked);};
$('#bulk-status').onchange=e=>$('#sale-controls').hidden=e.target.value!=='거래완료';
$('#apply').onclick=async()=>{
  const selected=new Set($$('#volumes input:checked').map(n=>Number(n.value)));if(!selected.size){toast('상태를 변경할 권을 먼저 선택해 주세요.');return;}
  try{const status=$('#bulk-status').value,next=books.map(b=>b.id===currentId?{...b,volumes:b.volumes.map(v=>selected.has(v.number)?changeStatus(v,status,$('#sold-on').value,$('#replace-sold-date').checked):v)}:b);
    if(await persist(next)){const b=books.find(b=>b.id===currentId);renderVolumes(b);updateDetailDates(b);toast(`${selected.size}권을 ${status}(으)로 변경했어요.`);}
  }catch(err){toast(err.message);}
};
$('#save-note').onclick=async()=>{if(photoRequest?.target==='detail'){toast('사진을 처리 중이에요. 잠시 기다려 주세요.');return;}if(await persist(books.map(b=>b.id===currentId?{...b,note:$('#detail-note').value,photo:draftPhotos.detail}:b))){$('#detail').close();toast('사진과 메모를 저장했어요.');}};
$('#delete').onclick=async()=>{const b=books.find(b=>b.id===currentId);if(confirm(`「${b.title}」 ${b.volumes.length}권을 삭제할까요? 삭제 전 백업을 권장해요.`)&&await persist(books.filter(b=>b.id!==currentId))){$('#detail').close();toast('시리즈를 삭제했어요.');}};
async function shrinkPhoto(file){
  if(file.size>32*1024*1024)throw Error('32MB 이하의 사진을 선택해 주세요.');
  if(!file.type.startsWith('image/'))throw Error('사진 파일을 선택해 주세요.');
  const url=URL.createObjectURL(file);let image;
  try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('읽을 수 없는 사진이에요. JPG 또는 PNG 사진으로 다시 선택해 주세요.'));img.src=url;});}
  finally{URL.revokeObjectURL(url);}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  for(const edge of [320,240,160]){
    const ratio=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.8,.65,.5,.35]){const photo=canvas.toDataURL('image/jpeg',quality);if(photo.length<=MAX_PHOTO_LENGTH&&validPhoto(photo))return photo;}
  }
  throw Error('사진을 썸네일로 만들지 못했어요. 다른 사진을 선택해 주세요.');
}
function acceptPhoto(requestId,photo,error){
  if(!photoRequest||requestId!==photoRequest.id)return;
  const request=photoRequest;photoRequest=null;
  if(error){toast(error);return;}if(!photo)return;
  if(!$(`#${request.target}`).open||(request.target==='detail'&&request.bookId!==currentId)){toast('사진을 넣을 창을 다시 열고 선택해 주세요.');return;}
  if(!validPhoto(photo)){toast('사진 형식을 읽지 못했어요. 다시 선택해 주세요.');return;}
  showPhoto(request.target,photo);toast('사진을 준비했어요. 저장 버튼을 눌러 반영해 주세요.');
}
$$('[data-photo]').forEach(b=>b.onclick=()=>{
  if(photoRequest){toast('사진을 처리 중이에요. 잠시 기다려 주세요.');return;}
  photoRequest={id:crypto.randomUUID(),target:b.dataset.photo,bookId:currentId};
  try{
    if(android()){if(b.dataset.source==='camera')window.ChaekjangNative.takePhoto(photoRequest.id);else window.ChaekjangNative.choosePhoto(photoRequest.id);}
    else $(b.dataset.source==='camera'?'#camera-file':'#photo-file').click();
  }catch{photoRequest=null;toast('사진 선택 창을 열지 못했어요. 앱을 다시 열고 시도해 주세요.');}
});
$$('[data-photo-remove]').forEach(b=>b.onclick=()=>{photoRequest=null;showPhoto(b.dataset.photoRemove,null);});
for(const id of ['photo-file','camera-file']){
  $('#'+id).onchange=async e=>{const request=photoRequest;if(!request)return;const file=e.target.files[0];try{if(file)acceptPhoto(request.id,await shrinkPhoto(file));else photoRequest=null;}catch(err){acceptPhoto(request.id,null,err.message);}finally{e.target.value='';}};
  $('#'+id).addEventListener('cancel',()=>photoRequest=null);
}
window.addEventListener('chaekjang-photo',e=>{const d=e.detail||{};acceptPhoto(d.requestId,d.photo,d.error);});
function actualBooks(){return demo?realBooks:books;}
function backupText(){const text=JSON.stringify({version:2,exportedAt:new Date().toISOString(),books:actualBooks()});if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('백업 크기가 128MB를 넘었어요. 사진을 줄인 뒤 다시 시도해 주세요.');return text;}
$('#backup').onclick=()=>{
  if(!canUse())return;const list=actualBooks();$('#backup-summary').textContent=`내 시리즈 ${list.length}개 · ${list.reduce((n,b)=>n+b.volumes.length,0).toLocaleString()}권`;
  $('#backup-demo-note').hidden=!demo;$('#share-backup').hidden=!android()&&!navigator.share;
  $('#save-backup').textContent=android()?'휴대폰·Drive에 파일 저장':'백업 파일 다운로드';$('#backup-dialog').showModal();
};
async function exportFile(mode){
  try{
    const text=backupText(),name=`책장-백업-${localDay()}.json`;
    if(android()){window.ChaekjangNative.exportBackup(text,mode);$('#backup-dialog').close();toast(mode==='share'?'공유할 앱을 선택해 주세요.':'백업 파일을 저장할 위치를 선택해 주세요.');return;}
    const blob=new Blob([text],{type:'application/json'});
    if(mode==='share'&&navigator.canShare?.({files:[new File([blob],name,{type:'application/json'})]})){await navigator.share({files:[new File([blob],name,{type:'application/json'})],title:'책장 백업'});$('#backup-dialog').close();return;}
    const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#backup-dialog').close();toast('백업 파일을 다운로드했어요. 안전하게 보관해 주세요.');
  }catch(err){if(err.name!=='AbortError')toast(err.message||'백업 파일을 준비하지 못했어요.');}
}
$('#save-backup').onclick=()=>exportFile('save');$('#share-backup').onclick=()=>exportFile('share');
async function restoreText(text){
  try{
    if(saveBusy){toast('저장 중이에요. 완료 후 다시 복원해 주세요.');return;}
    if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('128MB 이하의 백업 파일을 선택해 주세요.');
    const restored=validateBackup(JSON.parse(text));if(!confirm(`실제 내 컬렉션을 백업의 ${restored.length}개 시리즈로 교체할까요? 기존 목록은 덮어씁니다.`))return;
    saveBusy=true;try{await saveCollection(restored);}finally{saveBusy=false;}
    books=restored;realBooks=[];demo=false;ready=true;storageBlocked=false;page=1;filter='all';$('#search').value='';$('#loading').hidden=true;render();toast('사진과 날짜를 포함해 백업을 복원했어요.');
  }catch(err){toast(err instanceof SyntaxError?'올바른 JSON 백업 파일을 선택해 주세요.':err.message||'복원에 실패했어요. 기존 목록은 유지했어요.');}
}
$('#restore').onclick=()=>{if(!ready){toast('목록을 불러오는 중이에요.');return;}try{if(android()){window.ChaekjangNative.importBackup();toast('내 휴대폰이나 Drive에서 백업 파일을 선택해 주세요.');}else $('#file').click();}catch{toast('파일 선택 창을 열지 못했어요. 앱을 다시 열고 시도해 주세요.');}};
$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>MAX_BACKUP_BYTES)throw Error('128MB 이하의 백업 파일을 선택해 주세요.');await restoreText(await file.text());}catch(err){toast(err.message);}finally{e.target.value='';}};
window.addEventListener('chaekjang-restore',e=>{if(typeof e.detail==='string')restoreText(e.detail);});
window.addEventListener('chaekjang-message',e=>{if(typeof e.detail==='string')toast(e.detail);});
if(android()){$('footer span').textContent='이 휴대폰에 저장됩니다 · 앱 삭제 전 꼭 백업하세요.';$('.header-context').textContent='나의 만화책장 · 오프라인';document.body.classList.add('android-app');}
$('#demo').onclick=()=>{
  if(!canUse())return;
  if(demo){books=realBooks;realBooks=[];demo=false;}
  else{realBooks=books;demo=true;books=[['슬램덩크','이노우에 다케히코',31,'거래중','전권 세트 · 중고나라 문의 답변하기.'],['원피스','오다 에이치로',108,'보유중','1–60권은 거실 책장, 나머지는 서재에 보관.'],['귀멸의 칼날','고토게 코요하루',23,'거래중','완결 세트 / 택배비 포함 75,000원.'],['명탐정 코난','아오야마 고쇼',105,'보유중','초판 일부 포함. 책장 두 번째 칸.'],['하이큐!!','후루다테 하루이치',45,'보유중','전권 완결 · 가장 아끼는 시리즈.'],['강철의 연금술사','아라카와 히로무',27,'거래완료','전권 판매 완료. 다음 독자에게 잘 도착!']].map(([title,author,to,status,note],i)=>({id:`demo-${i}`,title,author,volumes:makeVolumes(1,to,'',status),note,createdAt:Date.now()-i*86400000,photo:null}));}
  page=1;filter='all';$('#search').value='';render();
};
(async()=>{try{books=await loadCollection(validateBackup);ready=true;$('#loading').hidden=true;render();}catch{ready=true;storageBlocked=true;$('#loading').textContent='기존 목록을 읽지 못했어요. 앱을 다시 열거나 백업을 복원해 주세요. 기존 데이터는 덮어쓰지 않았어요.';toast('기기 저장 공간을 확인해 주세요. 기존 데이터는 보호하고 있어요.');}})();
