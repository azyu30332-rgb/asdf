// Sale photos and thumbnails live in IndexedDB, which does not share localStorage's small quota.
// The legacy snapshot is kept intact; an existing IndexedDB snapshot always takes priority.
const DB_NAME = 'chaekjang-library';
const LEGACY_KEY = 'chaekjang.collection.v1';
let database;
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => request.result.createObjectStore('library');
    request.onsuccess = () => {request.result.onversionchange = () => {request.result.close();database=undefined;};resolve(request.result);};
    request.onerror = () => {database=undefined;reject(request.error);};
    request.onblocked = () => {database=undefined;reject(Error('다른 책장 창을 닫고 다시 시도해 주세요.'));};
  });
  return database;
}
export async function loadCollection(validate) {
  const db = await openDatabase();
  const data = await new Promise((resolve,reject) => {
    const tx=db.transaction('library','readonly');const request=tx.objectStore('library').get('collection');
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error||Error('저장 목록을 읽지 못했어요.'));
  });
  if(data !== undefined) return validate(data);
  let legacy;
  try {legacy=localStorage.getItem(LEGACY_KEY);} catch {throw Error('기존 저장 공간을 읽지 못했어요.');}
  if(!legacy) return [];
  const books=validate(JSON.parse(legacy));
  await saveCollection(books);
  return books;
}
export async function saveCollection(books,folders=[]) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('library','readwrite');
    tx.objectStore('library').put({version:3,books,folders},'collection');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||Error('기기 저장에 실패했어요.'));
    tx.onerror=()=>{}; // onabort reports the final transaction outcome.
  });
}

export async function loadFolders(validate){
  const db=await openDatabase();const data=await new Promise((resolve,reject)=>{const tx=db.transaction('library','readonly');const req=tx.objectStore('library').get('collection');tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});
  return validate(data||{books:[],folders:[]});
}
