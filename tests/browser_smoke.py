"""Run with Python Playwright while `npm start` serves the project on port 3000."""
import asyncio, base64, json, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9222')
  ctx=await browser.new_context(viewport={'width':390,'height':844})
  page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  legacy={'version':1,'books':[{'id':'legacy','title':'기존 만화','author':'작가','note':'기존 메모','createdAt':1700000000000,'volumes':[{'number':1,'status':'거래완료'},{'number':2,'status':'보유중'}]}]}
  await page.add_init_script('if(!localStorage.getItem("seeded")){localStorage.setItem("chaekjang.collection.v1",'+json.dumps(json.dumps(legacy,ensure_ascii=False))+');localStorage.setItem("seeded","yes");}')
  await page.goto('http://127.0.0.1:3000/chaekjang.html');await page.locator('.book-card').wait_for()
  assert await page.locator('#app-version').inner_text()=='v1.1.1'
  assert await page.locator('#app-version').is_visible()
  assert '판매일 미기록' in await page.locator('.card-dates').inner_text()
  assert await page.evaluate('books[0].createdAt')==1700000000000
  assert await page.evaluate("parseFloat(getComputedStyle(document.querySelector('h3')).fontSize)")>=19
  assert await page.locator('#add').evaluate('(n)=>n.getBoundingClientRect().top')<120
  assert await page.locator('.book-card').first.evaluate('(n)=>n.getBoundingClientRect().top')<500
  assert await page.locator('.stats').evaluate('(n)=>getComputedStyle(n).gap')=='0px'
  await page.locator('#theme-settings').click()
  for theme in ['forest','cream','blue','dark']:
   await page.locator(f'[data-theme-option={theme}]').click();assert await page.locator('body').get_attribute('data-theme')==theme
  await page.locator('#themes-dialog .close').click();await page.reload();await page.locator('.book-card').wait_for();assert await page.locator('body').get_attribute('data-theme')=='dark'
  await page.locator('.book-card').click()
  data_uri=await page.evaluate("(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='#31699a';x.fillRect(0,0,600,800);x.fillStyle='white';x.font='bold 50px sans-serif';x.fillText('MY MANGA',30,100);return c.toDataURL('image/jpeg');})()")
  photo=Path(tempfile.gettempdir())/'chaekjang-test-cover.jpg';photo.write_bytes(base64.b64decode(data_uri.split(',')[1]))
  async with page.expect_file_chooser() as chooser:await page.locator('[data-photo=detail][data-source=gallery]').click()
  await (await chooser.value).set_files(str(photo));await page.locator('#detail-preview img:not([hidden])').wait_for()
  await page.locator('#save-note').click();await page.locator('#detail').wait_for(state='hidden');await page.reload();await page.locator('.cover img').wait_for()
  assert await page.evaluate('books[0].createdAt')==1700000000000
  await page.locator('.book-card').click();await page.locator('#volumes input').first.check(force=True)
  await page.locator('#bulk-status').select_option('거래완료');await page.locator('#sold-on').fill('2025-01-02');await page.locator('#apply').click();await page.wait_for_function("books[0].volumes[0].soldAt==='2025-01-02'")
  await page.locator('#volumes input').first.check(force=True);await page.locator('#sold-on').fill('2025-02-03');await page.locator('#apply').click();await page.wait_for_function("!saveBusy")
  assert await page.evaluate('books[0].volumes[0].soldAt')=='2025-01-02'
  await page.locator('#volumes input').first.check(force=True);await page.locator('#replace-sold-date').check();await page.locator('#apply').click();await page.wait_for_function("books[0].volumes[0].soldAt==='2025-02-03'")
  await page.locator('#detail .close').click();await page.locator('#demo').click();assert await page.locator('#backup').is_enabled()
  await page.locator('#backup').click();assert '1개' in await page.locator('#backup-summary').inner_text()
  async with page.expect_download() as downloaded:await page.locator('#save-backup').click()
  file=await (await downloaded.value).path();backup=json.loads(Path(file).read_text());assert backup['version']==2 and len(backup['books'])==1
  assert backup['books'][0]['photo'].startswith('data:image/jpeg;base64,') and len(backup['books'][0]['photo'])<=33000
  assert backup['books'][0]['volumes'][0]['soldAt']=='2025-02-03'
  await page.evaluate("window.dispatchEvent(new CustomEvent('chaekjang-restore',{detail:'invalid'}))")
  assert 'JSON' in await page.locator('#toast').inner_text()
  page.once('dialog',lambda d:d.accept());await page.locator('#file').set_input_files(str(file));await page.wait_for_function("!demo && books.length===1 && !saveBusy")
  assert await page.locator('.cover img').count()==1
  await page.locator('#demo').click();await page.screenshot(path='/tmp/chaekjang-v110-dark-mobile.png',full_page=True)
  await page.locator('#theme-settings').click();await page.locator('[data-theme-option=forest]').click();await page.locator('#themes-dialog .close').click();await page.screenshot(path='/tmp/chaekjang-v110-forest-mobile.png',full_page=True)
  await page.set_viewport_size({'width':1440,'height':1000});await page.screenshot(path='/tmp/chaekjang-v110-desktop.png',full_page=True)
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  print('PASS: legacy migration, larger fonts, compact spacing, four persistent themes, real photo compression/persistence, per-volume sale dates, idempotence and corrections, real-data backup in sample mode, photos/dates backup restore, invalid restore protection, responsive layout; no JavaScript errors')
  await ctx.close()

asyncio.run(main())
