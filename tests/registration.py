"""Registration stays reachable, photo edits work before save, and new themes persist."""
import asyncio,base64,os
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9222');ctx=await browser.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('TEST_BASE_URL','http://127.0.0.1:3014')+'/chaekjang.html');await page.wait_for_function('ready')
  await page.evaluate("persist(Array.from({length:12},(_,i)=>({id:String(i),title:'보관 책 '+i,author:i===1?'작가 미등록':'',note:'소장 메모',createdAt:1700000000000+i,volumes:[{number:1,status:'보유중'}]})),['소장용','판매 사진'])")
  await page.evaluate('scrollTo(0,document.body.scrollHeight)');assert await page.locator('#add').evaluate('n=>n.getBoundingClientRect().bottom<0')
  box=await page.locator('#floating-add').bounding_box();assert box['y']+box['height']<=844 and box['x']+box['width']<=390
  assert await page.evaluate("getComputedStyle(document.querySelector('#floating-add')).position")=='fixed'
  assert await page.locator('.folder-tile').first.evaluate('n=>n.getBoundingClientRect().height')<=68
  await page.locator('#floating-add').click();assert await page.locator('#editor').evaluate('n=>n.open && n.scrollTop===0');assert not await page.locator('#floating-add').is_visible()
  assert await page.evaluate("[...document.querySelector('#book-form').children].filter(n=>n.matches('label,.form-row,.photo-field')).map(n=>n.querySelector('[name]')?.name||n.className)")==['photo-field','title','from','missing','author','registeredOn','status','soldOn','folder','note']
  assert await page.locator('#edit-editor-cover').is_disabled()
  data=await page.evaluate("(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='#d48d2b';x.fillRect(0,0,600,800);x.fillStyle='white';x.fillRect(20,30,80,50);return c.toDataURL('image/jpeg')})()")
  async with page.expect_file_chooser() as chooser:await page.locator('[data-photo=editor][data-source=camera]').click()
  await (await chooser.value).set_files({'name':'camera.jpg','mimeType':'image/jpeg','buffer':base64.b64decode(data.split(',')[1])})
  await page.locator('#photo-viewer').wait_for(state='visible');original=await page.evaluate('draftImages.editor[0]')
  await page.locator('#edit-viewer-photo').click();await page.locator('#photo-editor').wait_for(state='visible');await page.locator('#rotate-right').click()
  canvas=await page.locator('#crop-canvas').bounding_box();await page.mouse.move(canvas['x']+canvas['width']*.1,canvas['y']+canvas['height']*.1);await page.mouse.down();await page.mouse.move(canvas['x']+canvas['width']*.9,canvas['y']+canvas['height']*.9,steps=4);await page.mouse.up();await page.locator('#save-crop').click();await page.wait_for_function('draftImages.editor.length===2 && !photoEditBusy')
  assert await page.evaluate('draftImages.editor[1]')==original
  await page.locator('#photo-viewer .close').click();await page.wait_for_function("document.querySelector('#editor-preview img').naturalWidth>document.querySelector('#editor-preview img').naturalHeight")
  # The direct cover edit button opens the crop tools without hunting in the album.
  await page.locator('#edit-editor-cover').click();await page.locator('#photo-editor').wait_for(state='visible');await page.locator('#photo-editor .close').click();await page.locator('#photo-viewer .close').click()
  await page.locator('[name=title]').fill('미생');await page.locator('[name=from]').fill('1');await page.locator('[name=to]').fill('3');await page.locator('[name=folder]').select_option('소장용');await page.locator('[name=note]').fill('촬영 원본과 편집본');await page.locator('#book-form button[type=submit]').click();await page.wait_for_function('books.length===13 && !saveBusy')
  b=await page.evaluate("books.find(b=>b.title==='미생')");assert b['author']=='' and b['photos'][1]==original and b['folder']=='소장용'
  await page.reload();await page.wait_for_function('ready');await page.locator('#search').fill('미');assert await page.locator('.book-card h3').all_text_contents()==['미생'];assert await page.locator('.book-card .author').inner_text()=='.'
  await page.locator('.book-card').click();assert (await page.locator('#detail-author').inner_text()).startswith('. ·');assert await page.evaluate("books.find(b=>b.title==='미생').photos[1]")==original;await page.locator('#detail .close').click()
  for theme in ['sunny','blossom','dark']:
   await page.locator('#theme-settings').click();await page.locator('[data-theme-option='+theme+']').click();await page.locator('#themes-dialog .close').click();await page.reload();await page.wait_for_function('ready');assert await page.locator('body').get_attribute('data-theme')==theme
   for width in [320,390,1024]:
    await page.set_viewport_size({'width':width,'height':844});assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path='/tmp/chaekjang180-'+theme+'.png',full_page=True)
  assert not errors,errors;await ctx.close();print('PASS: fixed add button after long scroll, ordered form, compact folders, camera preview crop/rotation before registration, edited cover + exact original retained, direct crop control, missing author dot and real-title search, new persistent themes at 320/390/1024px.')
asyncio.run(main())
