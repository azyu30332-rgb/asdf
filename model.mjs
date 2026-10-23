export const STATUSES = ['보유중', '거래중', '거래완료', '미보유'];
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_PHOTO_LENGTH = 33000;
export const MAX_SALE_PHOTO_LENGTH = 700000;
export const MAX_BOOK_PHOTOS = 12;
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return Number.isFinite(d.getTime()) && localDay(d) === value;
}
export function registrationTime(day, now = Date.now()) {
  if (!isDay(day) || day > localDay(new Date(now))) throw Error('등록일을 오늘 또는 이전 날짜로 입력해 주세요.');
  const value=day===localDay(new Date(now))?now:new Date(`${day}T12:00:00`).getTime();
  if(value<0)throw Error('등록일은 1970년 이후로 입력해 주세요.');
  return value;
}
export function validPhoto(value) {
  return value == null || (typeof value === 'string' && value.length <= MAX_PHOTO_LENGTH && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value) && (value.length-23)%4 === 0);
}
export function validSalePhoto(value){return typeof value==='string'&&value.length<=MAX_SALE_PHOTO_LENGTH&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value)&&(value.length-23)%4===0;}
export function bookPhotos(book){return Array.isArray(book.photos)&&book.photos.length?book.photos:book.photo?[book.photo]:[];}
export function makeVolumes(from, to, missing = '', status = '보유중', soldOn = localDay()) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 10000 || to < from || to - from > 4999) throw Error('권수는 1~10,000 사이이며, 한 번에 최대 5,000권까지 등록할 수 있어요.');
  if (!STATUSES.includes(status)) throw Error('올바른 상태를 선택해 주세요.');
  if (status === '거래완료' && !isDay(soldOn)) throw Error('올바른 거래완료일을 입력해 주세요.');
  const excluded = new Set();
  for (const chunk of missing.split(',').map(x => x.trim()).filter(Boolean)) {
    if (!/^\d+(\s*-\s*\d+)?$/.test(chunk)) throw Error('빠진 권은 3, 7-9 형태로 입력해 주세요.');
    const [a, b = a] = chunk.split('-').map(Number);
    if (a < from || b > to || a > b) throw Error('빠진 권은 등록할 권수 범위 안에서 입력해 주세요.');
    for (let n = a; n <= b; n++) excluded.add(n);
  }
  return Array.from({length: to - from + 1}, (_, i) => {
    const number=from+i, state=excluded.has(number)?'미보유':status;
    return {number,status:state,...(state==='거래완료'?{soldAt:soldOn}:{})};
  });
}
export function changeStatus(volume, status, soldOn, replaceDate = false) {
  if (!STATUSES.includes(status)) throw Error('올바른 상태를 선택해 주세요.');
  if (status === '거래완료' && !isDay(soldOn)) throw Error('거래완료일을 입력해 주세요.');
  return {...volume, status, soldAt:status === '거래완료' ? (!replaceDate && volume.status === status && volume.soldAt ? volume.soldAt : soldOn) : null};
}
export function seriesStatus(book) { return book.volumes.some(v => v.status === '거래중') ? '거래중' : book.volumes.some(v => v.status === '보유중') ? '보유중' : book.volumes.some(v => v.status === '거래완료') ? '거래완료' : '미보유'; }
export function validateFolders(data){
  const names=data?.folders===undefined?[]:data.folders;if(!Array.isArray(names)||names.length>1000)throw Error('올바른 폴더 목록이 아니에요.');
  const result=[],seen=new Set();
  for(const name of names){if(typeof name!=='string'||!name.trim()||name.trim().length>60||seen.has(name.trim()))throw Error('폴더 이름이 비어 있거나 중복돼요.');seen.add(name.trim());result.push(name.trim());}
  for(const b of data?.books||[]){if(!b||typeof b!=='object')continue;if(b.folder!==undefined&&(typeof b.folder!=='string'||b.folder.trim().length>60))throw Error('폴더 이름을 확인해 주세요.');if(b.folder?.trim()&&!seen.has(b.folder.trim())){seen.add(b.folder.trim());result.push(b.folder.trim());}}
  if(result.length>1000)throw Error('폴더는 최대 1,000개까지 만들 수 있어요.');return result;
}
export function validateBackup(data) {
  if (!data || ![1,2,3].includes(data.version) || !Array.isArray(data.books) || data.books.length > 10000) throw Error('책장 백업 파일이 아니거나 지원하지 않는 형식이에요.');
  validateFolders(data);
  const ids = new Set(); let total = 0;
  for (const b of data.books) {
    if (!b || typeof b.id !== 'string' || !b.id || ids.has(b.id) || typeof b.title !== 'string' || !b.title.trim() || b.title.length > 150 || typeof b.author !== 'string' || b.author.length > 100 || typeof b.note !== 'string' || b.note.length > 5000 || !Number.isFinite(b.createdAt) || b.createdAt < 0 || !Number.isFinite(new Date(b.createdAt).getTime()) || !Array.isArray(b.volumes) || !b.volumes.length || b.volumes.length > 10000 || (!validPhoto(b.photo)||(b.photos!==undefined&&(!Array.isArray(b.photos)||b.photos.length>MAX_BOOK_PHOTOS||!b.photos.every(validSalePhoto))))) throw Error('백업에 올바르지 않은 시리즈 또는 사진이 있어요.');
    ids.add(b.id); const nums = new Set();
    for (const v of b.volumes) {
      if (!v || !Number.isInteger(v.number) || v.number < 1 || v.number > 10000 || nums.has(v.number) || !STATUSES.includes(v.status) || (v.soldAt != null && (!isDay(v.soldAt) || v.status !== '거래완료'))) throw Error('백업에 올바르지 않은 권수, 상태 또는 판매일이 있어요.');
      nums.add(v.number);
    }
    total += Math.max(...nums)-Math.min(...nums)+1; if (total > 100000) throw Error('백업은 최대 100,000권까지 지원해요.');
  }
  return data.books.map(b => ({id:b.id,title:b.title.trim(),author:b.author,note:b.note,createdAt:b.createdAt,...(b.photo !== undefined ? {photo:b.photo}:{}),...(b.photos!==undefined?{photos:[...b.photos]}:{}),...(b.folder!==undefined?{folder:b.folder.trim()}:{}),volumes:fillMissing(b.volumes)}));
}
// Older versions omitted missing numbers. Recover interior gaps without inventing endpoints.
function fillMissing(volumes) {
  const known=new Map(volumes.map(v=>[v.number,v]));
  const first=Math.min(...known.keys()),last=Math.max(...known.keys());
  return Array.from({length:last-first+1},(_,i)=>{
    const number=first+i,v=known.get(number);
    return v?{number,status:v.status,...(v.soldAt!==undefined?{soldAt:v.soldAt}:{})}:{number,status:'미보유'};
  });
}
export function collectionCount(volumes){return volumes.filter(v=>v.status!=='미보유').length;}
export function volumeSummary(volumes){const missing=volumes.length-collectionCount(volumes);return `소장 ${collectionCount(volumes)}권${missing?` · 미보유 ${missing}권`:''}`;}
export function selectBooks(books, filter, query, sort) {
  const q = query.trim().toLocaleLowerCase();
  return books.filter(b => (filter === 'all' || b.volumes.some(v => v.status === filter)) && (!q || [b.title,b.author,b.note,b.folder||'',localDay(new Date(b.createdAt)),...b.volumes.flatMap(v=>[`${v.number}권`,v.soldAt||''])].some(s=>s.toLocaleLowerCase().includes(q)))).sort((a,b) => Number(seriesStatus(b)==='거래중') - Number(seriesStatus(a)==='거래중') || (sort === 'title' ? a.title.localeCompare(b.title,'ko') : sort === 'count' ? collectionCount(b.volumes)-collectionCount(a.volumes) : b.createdAt-a.createdAt));
}
