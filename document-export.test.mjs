import test from 'node:test';
import assert from 'node:assert/strict';
import {documentTables,csvDocument,spreadsheetDocument} from './document-export.mjs';
const books=[{title:'제목, "인용" & <책>',author:'작가',note:'첫 줄\n두 번째 줄',createdAt:new Date('2025-01-02T12:00:00').getTime(),volumes:[{number:3,status:'거래완료',soldAt:'2025-03-04'},{number:1,status:'보유중'},{number:2,status:'미보유'},{number:4,status:'거래중'},{number:5,status:'거래완료'}]}];
test('요약과 권별 표는 누락·판매일 미기록을 구분하고 순서·메모·등록일을 보존한다',()=>{
 const t=documentTables(books);assert.deepEqual(t.summary[1].slice(3,7),[1,1,2,1]);assert.equal(t.summary[1][8],'2025-03-04 (일부 미기록)');assert.deepEqual(t.detail.slice(1).map(r=>r[2]),[1,2,3,4,5]);assert.equal(t.detail[3][5],'2025-03-04');assert.equal(t.detail[5][5],'미기록');assert.equal(t.detail[1][4],'2025-01-02');assert.equal(t.detail[1][6],books[0].note);assert.equal(books[0].volumes[0].number,3);
});
test('CSV는 한국어 BOM·인용·쉼표·줄바꿈을 보존하며 셀 수식을 실행하지 않는다',()=>{
 const csv=csvDocument([['제목', '=HYPERLINK("x")',' \t+1','@SUM(1)',123,'줄1\n줄2']]);assert.ok(csv.startsWith('\ufeff"제목"'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"\' \t+1"'));assert.ok(csv.includes('"\'@SUM(1)"'));assert.ok(csv.includes('"123"'));assert.ok(csv.includes('"줄1\n줄2"'));
});
test('실제 XLSX 패키지와 CSV 요약·상세 및 빈 목록 내보내기를 지원한다',()=>{
 const x=spreadsheetDocument(books,'xlsx');assert.deepEqual([...x.bytes.slice(0,4)],[80,75,3,4]);assert.ok(x.name.endsWith('.xlsx'));assert.ok(new TextDecoder().decode(x.bytes).includes('제목, &quot;인용&quot; &amp; &lt;책&gt;'));assert.equal(documentTables([]).summary.length,1);assert.ok(spreadsheetDocument([],'xlsx').bytes.length>0);assert.ok(new TextDecoder().decode(spreadsheetDocument(books,'csv','summary').bytes).includes('최근 판매일'));assert.throws(()=>spreadsheetDocument(books,'exe'));
});
