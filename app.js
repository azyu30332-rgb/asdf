import {spreadsheetDocument} from './document-export.mjs';
import {validateFolders, bookPhotos, validSalePhoto, MAX_BOOK_PHOTOS, MAX_SALE_PHOTO_LENGTH, collectionCount, volumeSummary, makeVolumes, seriesStatus, validateBackup, selectBooks, changeStatus, localDay, isDay, validPhoto, MAX_BACKUP_BYTES, MAX_PHOTO_LENGTH, registrationTime} from './model.mjs';
import {loadCollection, loadFolders, saveCollection} from './storage.mjs';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let books=[], demo=false, realBooks=[], filter='all', page=1, currentId=null, ready=false, storageBlocked=false, saveBusy=false;
let folders=[],realFolders=[],folderFilter='all',editingFolder=null;
let toastTimer, photoRequest=null;
const draftPhotos={editor:null,detail:null};
const draftImages={editor:[],detail:[]};let photoEditBusy=false,viewerPhoto=null,editorSession=0;
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
async function persist(next,nextFolders=folders){
  if(saveBusy){toast('저장 중이에요. 잠시 기다려 주세요.');return false;}
  if(demo){books=next;folders=[...nextFolders];render();return true;}
  if(!canUse())return false;
  saveBusy=true;
  try{await saveCollection(next,nextFolders);books=next;folders=[...nextFolders];render();return true;}
  catch{toast('기기에 저장하지 못했어요. 저장 공간을 확인해 주세요. 기존 목록은 유지했어요.');return false;}
  finally{saveBusy=false;}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
const colors=['#225c51','#d17b47','#3f5574','#b05b58','#78643f','#51515e','#55807e','#777646'];
function color(title){return colors[Array.from(title).reduce((s,c)=>s+c.codePointAt(0),0)%colors.length];}
function badge(status){return el('span','badge '+(status==='거래중'?'trading':status==='거래완료'?'sold':status==='미보유'?'missing':''),status);}
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
  renderFolders();
  const counts={'보유중':0,'거래중':0,'거래완료':0};books.forEach(b=>b.volumes.forEach(v=>{if(v.status!=='미보유')counts[v.status]++;}));
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  for(const [id,n] of Object.entries({total,owned:counts['보유중'],trading:counts['거래중'],sold:counts['거래완료']}))$('#'+id).replaceChildren(document.createTextNode(n.toLocaleString()),el('small','','권'));
  $('#side-count').textContent=books.length;$('#series-count').textContent=`${books.length.toLocaleString()}개의 시리즈`;
  const matches=selectBooks(books.filter(matchesFolder),filter,$('#search').value,$('#sort').value);$('#result-count').textContent=matches.length;
  const pages=Math.max(1,Math.ceil(matches.length/12));page=Math.max(1,Math.min(page,pages));$('#list').replaceChildren();
  matches.slice((page-1)*12,page*12).forEach(b=>{
    const status=seriesStatus(b),card=el('article','book-card'+(status==='거래중'?' is-trading':''));
    card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${b.title} 상세 및 권별 상태 관리`);
    const top=el('div','card-top'),info=el('div','card-info');info.append(badge(status),el('h3','',b.title),el('p','author',b.author||'작가 미등록'));
    const r=el('div','range',range(b.volumes));r.append(el('b','',volumeSummary(b.volumes)));info.append(r);if(b.folder)info.append(el('span','folder-tag','▱ '+b.folder));top.append(makeCover(b),info);
    const note=el('p','card-note','✎ '+(b.note||'남겨진 메모가 없어요.'));note.title=b.note;
    const dates=el('div','card-dates');dates.append(el('span','',`등록 ${dateLabel(localDay(new Date(b.createdAt)))}`));if(saleSummary(b))dates.append(el('span','',saleSummary(b)));
    const trading=b.volumes.filter(v=>v.status==='거래중').length,sold=b.volumes.filter(v=>v.status==='거래완료').length,owned=b.volumes.filter(v=>v.status==='보유중').length;
    const partial=sold>0&&(owned>0||trading>0),bottom=el('div','card-bottom'),summary=el('div','card-status-summary');
    if(sold)summary.append(el('span','status-count '+(partial?'partial':'sold'),partial?`일부 판매 · ${sold}권 완료`:`판매 완료 · ${sold}권`));
    if(trading)summary.append(el('span','status-count trading',`거래중 ${trading}권`));
    if(owned)summary.append(el('span','status-count owned',`보유중 ${owned}권`));
    if(!sold&&!trading&&!owned)summary.append(el('span','status-count missing','미보유'));
    if(partial)info.insertBefore(el('span','badge partial','일부 판매'),info.querySelector('h3'));
    bottom.append(summary,el('span','detail-link','상세 보기 →'));card.append(top,note,dates,bottom);
    card.onclick=()=>openDetail(b.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(b.id);}};$('#list').append(card);
  });
  $('#empty').hidden=!!matches.length||!ready||storageBlocked;
  if(!matches.length){$('#empty h2').textContent=books.length?'검색 결과가 없어요':'첫 번째 이야기를 꽂아보세요';$('#empty p').textContent=books.length?'다른 검색어나 상태 필터를 사용해 보세요.':'제목과 권수를 입력하면 한 번에 등록할 수 있어요.';$('#empty-add').hidden=!!books.length;}
  $('#page-info').textContent=matches.length?`총 ${matches.length}개 · ${page}/${pages} 페이지`:'';
  $('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
  $('#demo-label').textContent=demo?'샘플 보기 · 실제 목록과 별도':'';$('#demo').textContent=demo?'내 컬렉션으로 돌아가기':'샘플 둘러보기';
  $$('[data-filter]').forEach(b=>{const active=b.dataset.filter===filter;b.classList.toggle(b.classList.contains('nav')?'active':'selected',active);b.setAttribute('aria-pressed',String(active));});
}
function matchesFolder(book){return folderFilter==='all'||(folderFilter==='none'?!book.folder:book.folder===folderFilter.slice(7));}
function fillFolderSelect(select,wanted){select.replaceChildren(new Option('미분류',''));for(const name of folders)select.add(new Option(name,name));select.value=folders.includes(wanted)?wanted:'';}
function renderFolders(){
  const folderCounts=new Map();for(const b of books)if(b.folder)folderCounts.set(b.folder,(folderCounts.get(b.folder)||0)+1);
  const filterSelect=$('#folder-filter');filterSelect.replaceChildren(new Option('전체 폴더','all'),new Option('미분류','none'));for(const name of folders)filterSelect.add(new Option(`${name} (${folderCounts.get(name)||0})`,'folder:'+name));if(folderFilter.startsWith('folder:')&&!folders.includes(folderFilter.slice(7)))folderFilter='all';filterSelect.value=folderFilter;
  for(const select of [$('#book-form [name=folder]'),$('#detail-folder')])fillFolderSelect(select,select.value);
  const list=$('#folder-list');list.replaceChildren();for(const name of folders){const row=el('div','folder-row'),label=el('strong','',`${name} · ${folderCounts.get(name)||0}개`),rename=el('button','','이름 변경'),remove=el('button','danger','삭제');rename.onclick=()=>{editingFolder=name;$('#folder-name').value=name;$('#folder-submit').textContent='이름 저장';$('#folder-name').focus();};remove.onclick=async()=>{if(!confirm(`「${name}」 폴더만 삭제할까요? 책과 사진은 삭제하지 않고 미분류로 이동해요.`))return;if(await persist(books.map(b=>b.folder===name?{...b,folder:''}:b),folders.filter(f=>f!==name))){editingFolder=null;$('#folder-form').reset();$('#folder-submit').textContent='폴더 만들기';toast('책과 사진은 미분류에 보관했어요.');}};row.append(label,rename,remove);list.append(row);}
}
$('#folder-filter').onchange=e=>{folderFilter=e.target.value;page=1;render();};
$('#manage-folders').onclick=()=>{if(!canUse())return;editingFolder=null;$('#folder-form').reset();$('#folder-submit').textContent='폴더 만들기';renderFolders();$('#folders-dialog').showModal();};
$('#cancel-folder-edit').onclick=()=>{editingFolder=null;$('#folder-form').reset();$('#folder-submit').textContent='폴더 만들기';};
$('#folder-form').onsubmit=async e=>{e.preventDefault();const name=$('#folder-name').value.trim(),old=editingFolder;if(!name||name.length>60){toast('폴더 이름은 1~60자로 입력해 주세요.');return;}if(folders.includes(name)&&name!==old){toast('같은 이름의 폴더가 있어요.');return;}const next=old?folders.map(f=>f===old?name:f):[...folders,name];if(next.length>1000){toast('폴더는 최대 1,000개까지 만들 수 있어요.');return;}if(await persist(old?books.map(b=>b.folder===old?{...b,folder:name}:b):books,next)){if(old&&folderFilter==='folder:'+old)folderFilter='folder:'+name;editingFolder=null;$('#folder-form').reset();$('#folder-submit').textContent='폴더 만들기';render();toast('폴더를 저장했어요.');}};
$('#detail-folder').onchange=async e=>{const name=e.target.value,id=currentId;if(!await persist(books.map(b=>b.id===id?{...b,folder:name}:b)))e.target.value=books.find(b=>b.id===id)?.folder||'';else toast('책의 폴더를 변경했어요.');};
function showPhoto(target,photo,images){draftPhotos[target]=photo;draftImages[target]=images?[...images]:photo?[photo]:[];const img=$(`#${target}-preview img`);img.hidden=!photo;if(photo)img.src=photo;else img.removeAttribute('src');renderAlbum(target);}
function renderAlbum(target){
  const list=draftImages[target],album=$(`#${target}-album`);album.replaceChildren();$(`#${target}-photo-count`).textContent=`${list.length}/${MAX_BOOK_PHOTOS}장 · 첫 사진이 표지`;
  list.forEach((photo,index)=>{
    const card=el('div','album-photo'),label=el('label','album-check'),check=el('input');check.type='checkbox';check.value=index;check.setAttribute('aria-label',`${index+1}번 사진 선택`);label.append(check,el('span','',index===0?'표지':`${index+1}번`));
    const open=el('button','album-open'),img=el('img');open.type='button';open.setAttribute('aria-label',`${index+1}번 사진 크게 보기`);img.src=photo;img.alt=`${index+1}번 책 사진`;img.loading='lazy';open.append(img);open.onclick=()=>openPhotoViewer(target,index);
    const controls=el('div','album-item-actions'),cover=el('button','',index===0?'현재 표지':'표지로'),remove=el('button','danger','삭제');cover.type=remove.type='button';cover.disabled=index===0;cover.onclick=()=>changeAlbum(target,[photo,...list.filter((_,i)=>i!==index)]);remove.onclick=()=>{if(confirm(`${index+1}번 사진을 앱에서 삭제할까요? 휴대폰 갤러리 원본은 유지돼요.`))changeAlbum(target,list.filter((_,i)=>i!==index));};controls.append(cover,remove);card.append(label,open,controls);album.append(card);
  });
  updateAlbumButtons(target);
}
function updateAlbumButtons(target){const count=$$(`#${target}-album input:checked`).length;$$(`[data-photo-export="${target}"]`).forEach(b=>b.disabled=!count||photoEditBusy);}
for(const target of ['editor','detail'])$(`#${target}-album`).onchange=()=>updateAlbumButtons(target);
$$('[data-photo-all]').forEach(b=>b.onclick=()=>{const list=$$(`#${b.dataset.photoAll}-album input`),checked=list.some(n=>!n.checked);list.forEach(n=>n.checked=checked);updateAlbumButtons(b.dataset.photoAll);});
async function changeAlbum(target,images,fromRequest=false){
  if(photoEditBusy||(!fromRequest&&photoRequest)){toast('사진을 처리 중이에요. 잠시 기다려 주세요.');return false;}
  const editingId=currentId,editingSession=editorSession;photoEditBusy=true;
  try{
    const thumb=images.length?await shrinkPhoto(images[0]):null;
    if(target==='editor'&&(!$('#editor').open||editorSession!==editingSession))return false;
    if(target==='detail'){
      if(!$('#detail').open||currentId!==editingId)return false;const id=editingId;
      if(!await persist(books.map(b=>b.id===id?{...b,photo:thumb,photos:[...images]}:b)))return false;
      if(!$('#detail').open||currentId!==id)return false;
    }
    showPhoto(target,thumb,images);return true;
  }catch(err){toast(err.message||'사진을 저장하지 못했어요.');return false;}
  finally{photoEditBusy=false;updateAlbumButtons(target);}
}
function openPhotoViewer(target,index){const photo=draftImages[target][index];if(!photo)return;viewerPhoto={target,index};$('#photo-viewer-title').textContent=`${index+1}번 사진`;$('#photo-viewer-image').src=photo;$('#photo-viewer').showModal();}
async function outputPhotos(target,indexes,mode){
  const images=indexes.map(i=>draftImages[target][i]).filter(Boolean);if(!images.length){toast('저장하거나 공유할 사진을 선택해 주세요.');return;}
  const title=target==='editor'?$('#book-form [name=title]').value:books.find(b=>b.id===currentId)?.title;
  try{
    if(android()){window.ChaekjangNative.exportPhotos(JSON.stringify(images),title||'책',mode);toast(mode==='share'?'사진을 보낼 앱을 선택해 주세요.':'사진을 저장하고 있어요.');return;}
    const files=images.map((data,i)=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));return new File([bytes],`책장-사진-${i+1}.jpg`,{type:'image/jpeg'});});
    if(mode==='share'&&navigator.canShare?.({files})){await navigator.share({files,title:title||'책 사진'});return;}
    for(const file of files){const url=URL.createObjectURL(file),a=el('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}toast(`${files.length}장 사진을 다운로드했어요.`);
  }catch(err){if(err.name!=='AbortError')toast('사진을 내보내지 못했어요. 다시 시도해 주세요.');}
}
$$('[data-photo-export]').forEach(b=>b.onclick=()=>outputPhotos(b.dataset.photoExport,$$(`#${b.dataset.photoExport}-album input:checked`).map(n=>Number(n.value)),b.dataset.mode));
$('#save-viewer-photo').onclick=()=>{if(viewerPhoto)outputPhotos(viewerPhoto.target,[viewerPhoto.index],'save');};$('#share-viewer-photo').onclick=()=>{if(viewerPhoto)outputPhotos(viewerPhoto.target,[viewerPhoto.index],'share');};

function add(){if(!canUse())return;editorSession++;$('#book-form').reset();$('#form-error').textContent='';$('#book-form [name=registeredOn]').value=localDay();$('#book-form [name=registeredOn]').max=localDay();$('#book-form [name=soldOn]').value=localDay();$('#initial-sale').hidden=true;showPhoto('editor',null);$('#book-form [name=folder]').value=folderFilter.startsWith('folder:')?folderFilter.slice(7):'';$('#editor').showModal();}
$('#add').onclick=add;$('#empty-add').onclick=add;
$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#book-form [name=status]').onchange=e=>$('#initial-sale').hidden=e.target.value!=='거래완료';
$('#book-form').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),submit=$('#book-form button[type=submit]');
  try{
    if(photoRequest?.target==='editor'||photoEditBusy)throw Error('사진을 처리 중이에요. 잠시 기다려 주세요.');
    const title=f.get('title').trim();if(!title)throw Error('시리즈 제목을 입력해 주세요.');
    const volumes=makeVolumes(Number(f.get('from')),Number(f.get('to')),f.get('missing'),f.get('status'),f.get('soldOn'));
    const numbers=new Set(volumes.map(v=>v.number));if(books.some(b=>b.title.toLocaleLowerCase()===title.toLocaleLowerCase()&&b.volumes.some(v=>numbers.has(v.number))))throw Error('같은 제목에 중복되는 권이 있어요. 기존 시리즈를 확인해 주세요.');
    const registeredOn=f.get('registeredOn'),createdAt=registrationTime(registeredOn);
    const b={id:crypto.randomUUID(),title,author:f.get('author').trim(),volumes,note:f.get('note').trim(),createdAt,photo:draftPhotos.editor,photos:[...draftImages.editor],folder:f.get('folder')||''};
    submit.disabled=true;if(await persist([...books,b])){$('#editor').close();toast(`${volumeSummary(volumes)}을 등록했어요.${demo?' (샘플)':''}`);}
  }catch(err){$('#form-error').textContent=err.message;}finally{submit.disabled=false;}
};
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;page=1;render();});
$('#search').oninput=()=>{page=1;render();};$('#sort').onchange=()=>{page=1;render();};$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$$('dialog').some(d=>d.open)){e.preventDefault();$('#search').focus();}});
function updateDetailDates(b){$('#detail-dates').textContent=`등록일 ${dateLabel(localDay(new Date(b.createdAt)))}${saleSummary(b)?' · '+saleSummary(b):''}`;}
function openDetail(id){
  currentId=id;const b=books.find(b=>b.id===id);$('#detail-title').textContent=b.title;$('#detail-author').textContent=`${b.author||'작가 미등록'} · ${range(b.volumes)} · ${volumeSummary(b.volumes)}`;
  updateDetailDates(b);$('#detail-folder').value=b.folder||'';$('#detail-note').value=b.note;showPhoto('detail',b.photo||null,bookPhotos(b));$('#sale-controls').hidden=true;$('#sold-on').value=localDay();$('#replace-sold-date').checked=false;renderVolumes(b);$('#detail').showModal();$('#detail').scrollTop=0;
}
function renderVolumes(b){$('#volumes').replaceChildren();b.volumes.forEach(v=>{
  const l=el('label','volume '+(v.status==='거래중'?'trading':v.status==='거래완료'?'sold':v.status==='미보유'?'missing':'')),input=el('input');input.type='checkbox';input.value=v.number;input.setAttribute('aria-label',`${v.number}권 · ${v.status}`);
  const span=el('span','',`${v.number}권 · ${v.status}`);if(v.status==='거래완료')span.append(el('small','',v.soldAt?`판매 ${dateLabel(v.soldAt)}`:'판매일 미기록'));l.append(input,span);$('#volumes').append(l);
});updateSelection();}
function updateSelection(){
  const count=$$('#volumes input:checked').length;$('#selected-count').textContent=`${count}권 선택`;
  $$('[data-set-status]').forEach(b=>b.disabled=!count||saveBusy);$('#apply').disabled=!count||saveBusy;
  $('#select-all').textContent=count===$$('#volumes input').length?'전체 해제':'전체 선택';
}
$('#volumes').onchange=()=>{$('#sale-controls').hidden=true;updateSelection();};
$('#clear-selection').onclick=()=>{$$('#volumes input').forEach(n=>n.checked=false);$('#sale-controls').hidden=true;updateSelection();};
$('#select-all').onclick=()=>{const all=$$('#volumes input'),checked=all.some(n=>!n.checked);all.forEach(n=>n.checked=checked);$('#sale-controls').hidden=true;updateSelection();};
$$('[data-set-status]').forEach(button=>button.onclick=()=>{
  if(button.dataset.setStatus==='거래완료'){$('#sale-controls').hidden=false;$('#sold-on').focus();}
  else{$('#sale-controls').hidden=true;applyStatus(button.dataset.setStatus);}
});
$('#cancel-sale').onclick=()=>$('#sale-controls').hidden=true;
$('#apply').onclick=()=>applyStatus('거래완료');
async function applyStatus(status){
  if(saveBusy)return;
  const selected=new Set($$('#volumes input:checked').map(n=>Number(n.value)));if(!selected.size){toast('상태를 변경할 권을 먼저 선택해 주세요.');return;}
  try{$$('[data-set-status]').forEach(b=>b.disabled=true);$('#apply').disabled=true;const next=books.map(b=>b.id===currentId?{...b,volumes:b.volumes.map(v=>selected.has(v.number)?changeStatus(v,status,$('#sold-on').value,$('#replace-sold-date').checked):v)}:b);
    if(await persist(next)){const b=books.find(b=>b.id===currentId);renderVolumes(b);$('#sale-controls').hidden=true;updateDetailDates(b);$('#detail-author').textContent=`${b.author||'작가 미등록'} · ${range(b.volumes)} · ${volumeSummary(b.volumes)}`;toast(`${selected.size}권을 ${status}(으)로 변경했어요.`);}
  }catch(err){toast(err.message);}finally{updateSelection();}
}
$('#save-note').onclick=async()=>{if(photoRequest?.target==='detail'||photoEditBusy){toast('사진을 처리 중이에요. 잠시 기다려 주세요.');return;}if(await persist(books.map(b=>b.id===currentId?{...b,note:$('#detail-note').value,photo:draftPhotos.detail,photos:[...draftImages.detail]}:b))){$('#detail').close();toast('사진과 메모를 저장했어요.');}};
$('#delete').onclick=async()=>{const b=books.find(b=>b.id===currentId);if(confirm(`「${b.title}」 ${b.volumes.length}권을 삭제할까요? 삭제 전 백업을 권장해요.`)&&await persist(books.filter(b=>b.id!==currentId))){$('#detail').close();toast('시리즈를 삭제했어요.');}};
let cropState=null;
$('#edit-viewer-photo').onclick=async()=>{
  if(!viewerPhoto)return;const {target,index}=viewerPhoto,photo=draftImages[target][index];if(draftImages[target].length>=MAX_BOOK_PHOTOS){toast('편집본을 추가하려면 사진 한 장을 정리해 주세요. 원본은 덮어쓰지 않아요.');return;}
  const imageId=currentId,session=editorSession,image=new Image();image.src=photo;try{await image.decode();}catch{toast('사진을 읽지 못했어요.');return;}
  if(!$('#photo-viewer').open||(target==='detail'&&imageId!==currentId)||(target==='editor'&&session!==editorSession))return;
  cropState={target,bookId:imageId,session,image,rotation:0,rotated:null,rect:null,start:null};renderCrop(true);$('#photo-editor').showModal();
};
function renderCrop(reset=false){
  const state=cropState;if(!state)return;const source=document.createElement('canvas'),quarter=state.rotation%2;source.width=quarter?state.image.naturalHeight:state.image.naturalWidth;source.height=quarter?state.image.naturalWidth:state.image.naturalHeight;const ctx=source.getContext('2d');ctx.translate(source.width/2,source.height/2);ctx.rotate(state.rotation*Math.PI/2);ctx.drawImage(state.image,-state.image.naturalWidth/2,-state.image.naturalHeight/2);state.rotated=source;
  const canvas=$('#crop-canvas');canvas.width=Math.min(900,source.width);canvas.height=Math.max(1,Math.round(source.height*canvas.width/source.width));if(reset||!state.rect)state.rect={x:0,y:0,w:canvas.width,h:canvas.height};paintCrop();
}
function paintCrop(){
  const state=cropState;if(!state)return;const c=$('#crop-canvas'),x=c.getContext('2d'),r=state.rect;x.clearRect(0,0,c.width,c.height);x.drawImage(state.rotated,0,0,c.width,c.height);x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,0,c.width,c.height);x.save();x.beginPath();x.rect(r.x,r.y,r.w,r.h);x.clip();x.drawImage(state.rotated,0,0,c.width,c.height);x.restore();x.strokeStyle='white';x.lineWidth=3;x.strokeRect(r.x,r.y,r.w,r.h);const scale=state.rotated.width/c.width;$('#crop-size').textContent=`저장 크기 ${Math.max(1,Math.round(r.w*scale))} × ${Math.max(1,Math.round(r.h*scale))}px`;
}
function cropPoint(event){const c=$('#crop-canvas'),r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(c.width,(event.clientX-r.left)*c.width/r.width)),y:Math.max(0,Math.min(c.height,(event.clientY-r.top)*c.height/r.height))};}
$('#crop-canvas').onpointerdown=e=>{if(!cropState)return;e.preventDefault();cropState.start=cropPoint(e);e.currentTarget.setPointerCapture(e.pointerId);};
$('#crop-canvas').onpointermove=e=>{if(!cropState?.start)return;const start=cropState.start,end=cropPoint(e);cropState.rect={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};paintCrop();};
$('#crop-canvas').onpointerup=()=>{if(!cropState?.start)return;cropState.start=null;if(cropState.rect.w<8||cropState.rect.h<8)renderCrop(true);};$('#crop-canvas').onpointercancel=()=>{if(cropState){cropState.start=null;renderCrop(true);}};
$('#rotate-left').onclick=()=>{if(cropState){cropState.rotation=(cropState.rotation+3)%4;renderCrop(true);}};$('#rotate-right').onclick=()=>{if(cropState){cropState.rotation=(cropState.rotation+1)%4;renderCrop(true);}};$('#reset-crop').onclick=()=>renderCrop(true);
$('#save-crop').onclick=async()=>{
  const state=cropState;if(!state||photoEditBusy)return;if(state.target==='detail'&&state.bookId!==currentId)return;
  const button=$('#save-crop');button.disabled=true;
  try{const r=state.rect,scale=state.rotated.width/$('#crop-canvas').width,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(r.w*scale));canvas.height=Math.max(1,Math.round(r.h*scale));canvas.getContext('2d').drawImage(state.rotated,r.x*scale,r.y*scale,r.w*scale,r.h*scale,0,0,canvas.width,canvas.height);const edited=await shrinkPhoto(canvas.toDataURL('image/jpeg',.85),true);
    if(!$('#photo-editor').open||(state.target==='detail'&&state.bookId!==currentId)||(state.target==='editor'&&state.session!==editorSession))return;
    if(await changeAlbum(state.target,[...draftImages[state.target],edited])){$('#photo-editor').close();viewerPhoto={target:state.target,index:draftImages[state.target].length-1};$('#photo-viewer-image').src=edited;$('#photo-viewer-title').textContent='편집본';toast('원본을 유지하고 편집본을 추가했어요.');cropState=null;}
  }catch{toast('사진을 편집하지 못했어요. 원본은 유지했어요.');}finally{button.disabled=false;}
};
async function shrinkPhoto(file,large=false){
  if(typeof file!=='string'&&file.size>32*1024*1024)throw Error('32MB 이하의 사진을 선택해 주세요.');
  if(typeof file!=='string'&&!file.type.startsWith('image/'))throw Error('사진 파일을 선택해 주세요.');
  const url=typeof file==='string'?file:URL.createObjectURL(file);let image;
  try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('읽을 수 없는 사진이에요. JPG 또는 PNG 사진으로 다시 선택해 주세요.'));img.src=url;});}
  finally{if(typeof file!=='string')URL.revokeObjectURL(url);}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  for(const edge of (large?[1600,1280,960,640]:[320,240,160])){
    const ratio=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.8,.65,.5,.35]){const photo=canvas.toDataURL('image/jpeg',quality);if(large?validSalePhoto(photo):validPhoto(photo))return photo;}
  }
  throw Error('사진을 썸네일로 만들지 못했어요. 다른 사진을 선택해 주세요.');
}
async function acceptPhotos(requestId,photos,error){
  if(!photoRequest||requestId!==photoRequest.id)return;const request=photoRequest;
  try{
    if(error){toast(error);return;}if(!photos?.length)return;
    if((request.target==='editor'&&request.session!==editorSession)||!$(`#${request.target}`).open||(request.target==='detail'&&request.bookId!==currentId))return;
    if(!Array.isArray(photos)||!photos.every(validSalePhoto)){toast('사진 형식을 읽지 못했어요.');return;}
    const combined=[...draftImages[request.target],...photos];if(combined.length>MAX_BOOK_PHOTOS){toast(`한 시리즈에 최대 ${MAX_BOOK_PHOTOS}장까지 보관할 수 있어요.`);return;}
    if(await changeAlbum(request.target,combined,true))toast(request.target==='detail'?`${photos.length}장 사진을 앱에 보관했어요.`:'사진을 준비했어요. 책 등록을 마쳐 보관하세요.');
  }finally{if(photoRequest?.id===requestId)photoRequest=null;}
}
$$('[data-photo]').forEach(b=>b.onclick=()=>{
  if(photoRequest||photoEditBusy){toast('사진을 처리 중이에요. 잠시 기다려 주세요.');return;}
  const remaining=MAX_BOOK_PHOTOS-draftImages[b.dataset.photo].length;if(!remaining){toast(`한 시리즈에 최대 ${MAX_BOOK_PHOTOS}장까지 보관할 수 있어요.`);return;}
  photoRequest={id:crypto.randomUUID(),target:b.dataset.photo,bookId:currentId,remaining,session:editorSession};
  try{
    if(android()){if(b.dataset.source==='camera')window.ChaekjangNative.takeBookPhoto(photoRequest.id);else window.ChaekjangNative.choosePhotos(photoRequest.id,remaining);}
    else $(b.dataset.source==='camera'?'#camera-file':'#photo-file').click();
  }catch{photoRequest=null;toast('사진 선택 창을 열지 못했어요. 앱을 다시 열고 시도해 주세요.');}
});
for(const id of ['photo-file','camera-file']){
  $('#'+id).onchange=async e=>{const request=photoRequest;if(!request)return;try{const files=[...e.target.files];if(files.length>request.remaining)throw Error(`최대 ${request.remaining}장 더 추가할 수 있어요.`);const photos=[];for(const file of files)photos.push(await shrinkPhoto(file,true));await acceptPhotos(request.id,photos);}catch(err){await acceptPhotos(request.id,null,err.message);}finally{e.target.value='';}};
  $('#'+id).addEventListener('cancel',()=>photoRequest=null);
}
window.addEventListener('chaekjang-photos',e=>{const d=e.detail||{};acceptPhotos(d.requestId,d.photos,d.error);});
function actualFolders(){return demo?realFolders:folders;}
function actualBooks(){return demo?realBooks:books;}
function backupText(){const text=JSON.stringify({version:3,exportedAt:new Date().toISOString(),books:actualBooks(),folders:actualFolders()});if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('백업 크기가 128MB를 넘었어요. 사진을 줄인 뒤 다시 시도해 주세요.');return text;}
$('#backup').onclick=()=>{
  if(!canUse())return;const list=actualBooks();$('#backup-summary').textContent=`내 시리즈 ${list.length}개 · ${list.reduce((n,b)=>n+collectionCount(b.volumes),0).toLocaleString()}권`;
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
$('#export-documents').onclick=()=>{
  if(!canUse())return;const list=actualBooks();$('#document-summary').textContent=`내 시리즈 ${list.length}개 · 권별 기록 ${list.reduce((n,b)=>n+b.volumes.length,0).toLocaleString()}개 (미보유 포함)`;
  $('#document-demo-note').hidden=!demo;$('#share-document').hidden=!android()&&!navigator.share;$('#save-document').textContent=android()?'휴대폰·Drive에 저장':'문서 다운로드';$('#documents-dialog').showModal();
};
$('#document-format').onchange=e=>$('#csv-scope-label').hidden=e.target.value!=='csv';
async function exportDocument(mode){
  if(!canUse())return;
  const buttons=[$('#save-document'),$('#share-document')];buttons.forEach(b=>b.disabled=true);
  try{
    const format=$('#document-format').value,documentFile=spreadsheetDocument(actualBooks(),format,$('#csv-scope').value);
    if(android()){
      let binary='';for(let i=0;i<documentFile.bytes.length;i+=32768)binary+=String.fromCharCode(...documentFile.bytes.subarray(i,i+32768));
      window.ChaekjangNative.exportDocument(btoa(binary),format,mode);$('#documents-dialog').close();toast(mode==='share'?'문서를 공유할 앱을 선택해 주세요.':'문서 파일을 저장할 위치를 선택해 주세요.');return;
    }
    const blob=new Blob([documentFile.bytes],{type:documentFile.mime}),file=new File([blob],documentFile.name,{type:documentFile.mime});
    if(mode==='share'&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'나의 책장 컬렉션'});}
    else{const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=documentFile.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('문서 파일을 다운로드했어요.');}
    $('#documents-dialog').close();
  }catch(err){if(err.name!=='AbortError')toast(err.message||'문서를 준비하지 못했어요.');}
  finally{buttons.forEach(b=>b.disabled=false);}
}
$('#save-document').onclick=()=>exportDocument('save');$('#share-document').onclick=()=>exportDocument('share');
async function restoreText(text){
  try{
    if(saveBusy){toast('저장 중이에요. 완료 후 다시 복원해 주세요.');return;}
    if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('128MB 이하의 백업 파일을 선택해 주세요.');
    const backupData=JSON.parse(text),restored=validateBackup(backupData),restoredFolders=validateFolders(backupData);if(!confirm(`실제 내 컬렉션을 백업의 ${restored.length}개 시리즈로 교체할까요? 기존 목록은 덮어씁니다.`))return;
    saveBusy=true;try{await saveCollection(restored,restoredFolders);}catch{throw Error('기기에 복원하지 못했어요. 저장 공간을 확인해 주세요. 기존 목록은 유지했어요.');}finally{saveBusy=false;}
    books=restored;folders=restoredFolders;realBooks=[];realFolders=[];folderFilter='all';demo=false;ready=true;storageBlocked=false;page=1;filter='all';$('#search').value='';$('#loading').hidden=true;render();toast('사진과 날짜를 포함해 백업을 복원했어요.');
  }catch(err){toast(err instanceof SyntaxError?'올바른 JSON 백업 파일을 선택해 주세요.':err.message||'복원에 실패했어요. 기존 목록은 유지했어요.');}
}
$('#restore').onclick=()=>{if(!ready){toast('목록을 불러오는 중이에요.');return;}try{if(android()){window.ChaekjangNative.importBackup();toast('내 휴대폰이나 Drive에서 백업 파일을 선택해 주세요.');}else $('#file').click();}catch{toast('파일 선택 창을 열지 못했어요. 앱을 다시 열고 시도해 주세요.');}};
$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>MAX_BACKUP_BYTES)throw Error('128MB 이하의 백업 파일을 선택해 주세요.');await restoreText(await file.text());}catch(err){toast(err.message);}finally{e.target.value='';}};
window.addEventListener('chaekjang-restore',e=>{if(typeof e.detail==='string')restoreText(e.detail);});
window.addEventListener('chaekjang-message',e=>{if(typeof e.detail==='string')toast(e.detail);});
if(android()){try{if(typeof window.ChaekjangNative.getAppVersion==='function')$('#app-version').textContent='v'+window.ChaekjangNative.getAppVersion();}catch{}$('footer span').textContent='이 휴대폰에 저장됩니다 · 앱 삭제 전 꼭 백업하세요.';$('.header-context').textContent='나의 책장 · 오프라인';document.body.classList.add('android-app');}
$('#demo').onclick=()=>{
  if(!canUse())return;
  if(demo){books=realBooks;folders=realFolders;realBooks=[];realFolders=[];demo=false;}
  else{realBooks=books;realFolders=folders;folders=[];demo=true;books=[['슬램덩크','이노우에 다케히코',31,'거래중','전권 세트 · 중고나라 문의 답변하기.'],['원피스','오다 에이치로',108,'보유중','1–60권은 거실 책장, 나머지는 서재에 보관.'],['귀멸의 칼날','고토게 코요하루',23,'거래중','완결 세트 / 택배비 포함 75,000원.'],['명탐정 코난','아오야마 고쇼',105,'보유중','초판 일부 포함. 책장 두 번째 칸.'],['하이큐!!','후루다테 하루이치',45,'보유중','전권 완결 · 가장 아끼는 시리즈.'],['강철의 연금술사','아라카와 히로무',27,'거래완료','전권 판매 완료. 다음 독자에게 잘 도착!']].map(([title,author,to,status,note],i)=>({id:`demo-${i}`,title,author,volumes:makeVolumes(1,to,'',status),note,createdAt:Date.now()-i*86400000,photo:null}));}
  page=1;filter='all';folderFilter='all';$('#search').value='';render();
};
(async()=>{try{books=await loadCollection(validateBackup);folders=await loadFolders(validateFolders);ready=true;$('#loading').hidden=true;render();}catch{ready=true;storageBlocked=true;$('#loading').textContent='기존 목록을 읽지 못했어요. 앱을 다시 열거나 백업을 복원해 주세요. 기존 데이터는 덮어쓰지 않았어요.';toast('기기 저장 공간을 확인해 주세요. 기존 데이터는 보호하고 있어요.');}})();
