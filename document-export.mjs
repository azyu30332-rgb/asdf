import {favoriteLabel, localDay, MAX_BACKUP_BYTES} from './model.mjs';

export function documentTables(books){
  const summary=[['제목','작가','권수 범위','보유중','거래중','거래완료','미보유','등록일','최근 판매일','메모','폴더','즐겨찾기']];
  const detail=[['제목','작가','권','상태','등록일','거래완료일','메모','폴더','즐겨찾기']];
  for(const book of books){
    const volumes=[...book.volumes].sort((a,b)=>a.number-b.number),counts={'보유중':0,'거래중':0,'거래완료':0,'미보유':0};
    const registered=localDay(new Date(book.createdAt));
    for(const v of volumes){counts[v.status]++;detail.push([book.title,book.author,v.number,v.status,registered,v.status==='거래완료'?(v.soldAt||'미기록'):'',book.note,book.folder||'미분류',favoriteLabel(book.favorite)]);}
    const dates=volumes.filter(v=>v.status==='거래완료'&&v.soldAt).map(v=>v.soldAt).sort();
    const unknown=volumes.some(v=>v.status==='거래완료'&&!v.soldAt);
    summary.push([book.title,book.author,volumes.length===1?`${volumes[0].number}권`:`${volumes[0].number}–${volumes.at(-1).number}권`,counts['보유중'],counts['거래중'],counts['거래완료'],counts['미보유'],registered,dates.length?dates.at(-1)+(unknown?' (일부 미기록)':''):unknown?'미기록':'',book.note,book.folder||'미분류',favoriteLabel(book.favorite)]);
  }
  return {summary,detail};
}
export function csvDocument(rows){
  // Treat user text as text even when opened by a spreadsheet that recognizes formulas.
  return '\ufeff'+rows.map(row=>row.map(value=>{
    let text=String(value??'');if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}
function xmlText(value){return String(value??'').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function columnName(index){let name='';for(index++;index;index=Math.floor((index-1)/26))name=String.fromCharCode(65+(index-1)%26)+name;return name;}
function sheetXml(rows,widths){
  const last=columnName(rows[0].length-1)+rows.length;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+last+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols><sheetData>'+rows.map((row,r)=>`<row r="${r+1}">`+row.map((value,c)=>typeof value==='number'?`<c r="${columnName(c)}${r+1}"><v>${value}</v></c>`:`<c r="${columnName(c)}${r+1}" t="inlineStr"${r===0?' s="1"':''}><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`).join('')+'</row>').join('')+`</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zipStored(files){
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0,centralSize=0;
  for(const [path,text] of Object.entries(files)){
    const name=encoder.encode(path),data=encoder.encode(text),crc=crc32(data),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
    const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(14,33,true);e.setUint32(16,crc,true);e.setUint32(20,data.length,true);e.setUint32(24,data.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);
    parts.push(header,data);central.push(entry);offset+=header.length+data.length;centralSize+=entry.length;
    if(offset+centralSize+22>MAX_BACKUP_BYTES)throw Error('문서 크기가 128MB를 넘었어요. 메모 길이를 줄인 뒤 다시 시도해 주세요.');
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let cursor=0;for(const part of [...parts,...central,end]){result.set(part,cursor);cursor+=part.length;}return result;
}
export function xlsxDocument(tables){
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStored({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="시리즈 요약" sheetId="1" r:id="rId1"/><sheet name="권별 상세" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF225C51"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0" fontId="0" fillId="0" borderId="0" numFmtId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf xfId="0" fontId="1" fillId="2" borderId="0" numFmtId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml':sheetXml(tables.summary,[28,22,16,12,12,12,12,16,26,55,22,16]),
    'xl/worksheets/sheet2.xml':sheetXml(tables.detail,[28,22,10,16,16,18,55,22,16])
  });
}
export function spreadsheetDocument(books,format,scope='detail'){
  const tables=documentTables(books);
  if(format==='xlsx')return {bytes:xlsxDocument(tables),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name:`책장-목록-${localDay()}.xlsx`};
  if(format!=='csv'||!['summary','detail'].includes(scope))throw Error('올바른 문서 형식을 선택해 주세요.');
  const bytes=new TextEncoder().encode(csvDocument(tables[scope]));if(bytes.length>MAX_BACKUP_BYTES)throw Error('문서 크기가 128MB를 넘었어요.');
  return {bytes,mime:'text/csv',name:`책장-${scope==='summary'?'시리즈요약':'권별상세'}-${localDay()}.csv`};
}
