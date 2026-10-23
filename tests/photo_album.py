"""Exercise old-photo retention, multi-photo autosave, cover changes, JPEG download and backup."""
import asyncio,base64,json,os,tempfile
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9222');ctx=await browser.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('TEST_BASE_URL','http://127.0.0.1:3014')+'/chaekjang.html');await page.wait_for_function('ready')
  photos=[]
  for w,h,color in [(240,320,'#226655'),(2400,1800,'#d17b47'),(1600,2200,'#336ca6')]:photos.append(await page.evaluate('''([w,h,color])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);x.fillStyle='white';x.font='40px sans-serif';x.fillText('BOOK PHOTO',20,60);return c.toDataURL('image/jpeg',.9)}''',[w,h,color]))
  legacy={'id':'legacy','title':'예전 사진이 있는 책','author':'작가','note':'메모 보존','createdAt':1700000000000,'photo':photos[0],'volumes':[{'number':1,'status':'거래완료','soldAt':'2025-03-04'}]}
  await page.evaluate('b=>persist([b])',legacy);await page.reload();await page.locator('.book-card').click()
  assert await page.locator('#detail-album img').count()==1
  with tempfile.TemporaryDirectory() as folder:
   files=[]
   for i,photo in enumerate(photos[1:]):
    file=Path(folder)/f'photo-{i}.jpg';file.write_bytes(base64.b64decode(photo.split(',')[1]));files.append(str(file))
   async with page.expect_file_chooser() as chooser:await page.locator('[data-photo=detail][data-source=gallery]').click()
   await (await chooser.value).set_files(files)
   await page.wait_for_function('books[0].photos?.length===3 && !photoEditBusy && !photoRequest && !saveBusy')
   assert await page.evaluate('books[0].photos[0]')==photos[0]
   for file in files:Path(file).unlink()
  await page.locator('#detail .close').click();await page.reload();await page.locator('.book-card').click()
  assert await page.locator('#detail-album img').count()==3
  assert await page.evaluate('books[0].note')=='메모 보존'
  assert await page.evaluate('books[0].createdAt')==1700000000000
  await page.locator('#detail-album .album-open').nth(1).click();await page.wait_for_function("document.querySelector('#photo-viewer-image').naturalWidth>0")
  assert await page.locator('#photo-viewer-image').evaluate('n=>Math.max(n.naturalWidth,n.naturalHeight)')==1600
  expected=await page.evaluate('draftImages.detail[1]')
  async with page.expect_download() as download:await page.locator('#save-viewer-photo').click()
  file=await (await download.value).path();assert Path(file).read_bytes()==base64.b64decode(expected.split(',')[1])
  await page.locator('#photo-viewer .close').click()
  await page.locator('#detail-album .album-item-actions button').nth(4).click()
  await page.wait_for_function('!photoEditBusy && !saveBusy')
  assert await page.evaluate('books[0].photos[1]')==photos[0]
  page.once('dialog',lambda d:d.accept());await page.locator('#detail-album .album-item-actions .danger').nth(2).click();await page.wait_for_function('books[0].photos.length===2 && !photoEditBusy')
  assert await page.evaluate('books[0].photos.includes('+json.dumps(photos[0])+')')
  await page.locator('#detail .close').click();await page.reload();await page.locator('.book-card').click();assert await page.locator('#detail-album img').count()==2
  async with page.expect_file_chooser() as chooser:await page.locator('[data-photo=detail][data-source=gallery]').click()
  await (await chooser.value).set_files([{'name':f'{i}.jpg','mimeType':'image/jpeg','buffer':base64.b64decode(photos[0].split(',')[1])} for i in range(11)])
  await page.wait_for_function('photoRequest===null');assert await page.evaluate('books[0].photos.length')==2
  await page.locator('#detail .close').click();await page.locator('#backup').click()
  async with page.expect_download() as download:await page.locator('#save-backup').click()
  file=await (await download.value).path();backup=json.loads(Path(file).read_text());assert backup['version']==3 and len(backup['books'][0]['photos'])==2;assert photos[0] in backup['books'][0]['photos']
  page.once('dialog',lambda d:d.accept());await page.locator('#file').set_input_files(str(file));await page.wait_for_function('!saveBusy');await page.reload();await page.locator('.book-card').click();assert await page.locator('#detail-album img').count()==2
  assert await page.evaluate('books[0].volumes[0].soldAt')=='2025-03-04';assert await page.locator('#detail').evaluate('n=>n.scrollWidth<=n.clientWidth')
  originals=await page.evaluate('books[0].photos')
  await page.locator('#detail-album .album-open').first.click();await page.locator('#edit-viewer-photo').click();await page.locator('#rotate-right').click()
  assert await page.evaluate('cropState.rotation')==1
  canvas=await page.locator('#crop-canvas').bounding_box();await page.mouse.move(canvas['x']+canvas['width']*.2,canvas['y']+canvas['height']*.2);await page.mouse.down();await page.mouse.move(canvas['x']+canvas['width']*.8,canvas['y']+canvas['height']*.8,steps=5);await page.mouse.up()
  await page.locator('#save-crop').click();await page.wait_for_function('books[0].photos.length===3 && !photoEditBusy')
  assert (await page.evaluate('books[0].photos'))[:2]==originals
  await page.wait_for_function("document.querySelector('#photo-viewer-image').naturalWidth>0")
  assert await page.locator('#photo-viewer-image').evaluate('n=>n.naturalWidth>n.naturalHeight && n.naturalWidth<1600')
  await page.locator('#photo-viewer .close').click();await page.locator('#detail .close').click()
  await page.locator('#manage-folders').click();await page.locator('#folder-name').fill('판매 예정');await page.locator('#folder-submit').click();await page.wait_for_function("folders.includes('판매 예정') && !saveBusy")
  await page.locator('#folder-name').fill('빈 폴더');await page.locator('#folder-submit').click();await page.wait_for_function('folders.length===2 && !saveBusy');await page.locator('#folders-dialog .close').click()
  await page.locator('.book-card').click();await page.locator('#detail-folder').select_option('판매 예정');await page.wait_for_function("books[0].folder==='판매 예정' && !saveBusy");await page.locator('#detail .close').click();await page.reload();await page.locator('.book-card').wait_for()
  assert await page.evaluate('folders')==['판매 예정','빈 폴더'];assert await page.evaluate('books[0].photos.length')==3
  await page.locator('[data-folder-filter="folder:빈 폴더"]').click();assert await page.locator('.book-card').count()==0
  await page.locator('[data-folder-filter="folder:판매 예정"]').click();assert await page.locator('.book-card').count()==1
  await page.locator('#backup').click()
  async with page.expect_download() as folder_backup:await page.locator('#save-backup').click()
  folder_file=await (await folder_backup.value).path();saved=json.loads(Path(folder_file).read_text());assert saved['folders']==['판매 예정','빈 폴더'] and saved['books'][0]['folder']=='판매 예정'
  await page.locator('#manage-folders').click();await page.locator('#folder-list .folder-row').first.locator('button').first.click();await page.locator('#folder-name').fill('판매 사진');await page.locator('#folder-submit').click();await page.wait_for_function("books[0].folder==='판매 사진' && !saveBusy")
  page.once('dialog',lambda d:d.accept());await page.locator('#folder-list .folder-row').first.locator('.danger').click();await page.wait_for_function("books[0].folder==='' && !saveBusy");assert await page.evaluate('books[0].photos.length')==3;await page.locator('#folders-dialog .close').click()
  page.once('dialog',lambda d:d.accept());await page.locator('#file').set_input_files(str(folder_file));await page.wait_for_function("books[0].folder==='판매 예정' && folders.length===2 && !saveBusy");await page.reload();await page.locator('.book-card').click();assert await page.evaluate('books[0].photos.length')==3;assert await page.evaluate('books[0].note')=='메모 보존'
  await page.screenshot(path='/tmp/chaekjang160-album.png',full_page=True);assert not errors,errors
  await ctx.close();print('PASS: exact legacy-photo preservation, multi-photo autosave, source-file independence, 1600px JPEG download, cover change, delete only chosen photo, 12-photo cap, full-album backup/restore, crop/rotation keeps originals, folder create/move/rename/delete/filter and empty-folder backup preserved, original notes/dates/states preserved.')
asyncio.run(main())
