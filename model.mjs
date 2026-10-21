export const STATUSES = ['보유중', '거래중', '거래완료'];
export function makeVolumes(from, to, missing = '', status = '보유중') {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 10000 || to < from || to - from > 4999) throw Error('권수는 1~10,000 사이이며, 한 번에 최대 5,000권까지 등록할 수 있어요.');
  if (!STATUSES.includes(status)) throw Error('올바른 상태를 선택해 주세요.');
  const excluded = new Set();
  for (const chunk of missing.split(',').map(x => x.trim()).filter(Boolean)) {
    if (!/^\d+(\s*-\s*\d+)?$/.test(chunk)) throw Error('빠진 권은 3, 7-9 형태로 입력해 주세요.');
    const [a, b = a] = chunk.split('-').map(Number);
    if (a < from || b > to || a > b) throw Error('빠진 권은 등록할 권수 범위 안에서 입력해 주세요.');
    for (let n = a; n <= b; n++) excluded.add(n);
  }
  const result = Array.from({length: to - from + 1}, (_, i) => ({number: from + i, status})).filter(v => !excluded.has(v.number));
  if (!result.length) throw Error('최소 한 권은 등록해 주세요.');
  return result;
}
export function seriesStatus(book) { return book.volumes.some(v => v.status === '거래중') ? '거래중' : book.volumes.some(v => v.status === '보유중') ? '보유중' : '거래완료'; }
export function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.books) || data.books.length > 10000) throw Error('책장 백업 파일이 아니거나 지원하지 않는 형식이에요.');
  const ids = new Set(); let total = 0;
  for (const b of data.books) {
    if (!b || typeof b.id !== 'string' || ids.has(b.id) || typeof b.title !== 'string' || !b.title.trim() || b.title.length > 150 || typeof b.author !== 'string' || b.author.length > 100 || typeof b.note !== 'string' || b.note.length > 5000 || !Number.isFinite(b.createdAt) || !Array.isArray(b.volumes) || !b.volumes.length || b.volumes.length > 5000) throw Error('백업에 올바르지 않은 시리즈가 있어요.');
    ids.add(b.id); const nums = new Set();
    for (const v of b.volumes) { if (!v || !Number.isInteger(v.number) || v.number < 1 || v.number > 10000 || nums.has(v.number) || !STATUSES.includes(v.status)) throw Error('백업에 올바르지 않은 권수 또는 상태가 있어요.'); nums.add(v.number); }
    total += b.volumes.length; if (total > 100000) throw Error('백업은 최대 100,000권까지 지원해요.');
  }
  return data.books.map(b => ({id:b.id,title:b.title.trim(),author:b.author,note:b.note,createdAt:b.createdAt,volumes:b.volumes.map(v=>({number:v.number,status:v.status})).sort((a,b)=>a.number-b.number)}));
}
export function selectBooks(books, filter, query, sort) {
  const q = query.trim().toLocaleLowerCase();
  return books.filter(b => (filter === 'all' || b.volumes.some(v => v.status === filter)) && (!q || [b.title,b.author,b.note,...b.volumes.map(v=>`${v.number}권`)].some(s=>s.toLocaleLowerCase().includes(q)))).sort((a,b) => Number(seriesStatus(b)==='거래중') - Number(seriesStatus(a)==='거래중') || (sort === 'title' ? a.title.localeCompare(b.title,'ko') : sort === 'count' ? b.volumes.length-a.volumes.length : b.createdAt-a.createdAt));
}
