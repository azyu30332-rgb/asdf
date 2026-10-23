"""Visual folders and favorite colors persist alongside original photos and notes."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9222');ctx=await browser.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('TEST_BASE_URL','http://127.0.0.1:3014')+'/chaekjang.html');await page.wait_for_function('ready')
  await page.evaluate("""async()=>{const c=document.createElement('canvas');c.width=240;c.height=320;c.getContext('2d').fillRect(0,0,240,320);const photo=c.toDataURL('image/jpeg');await persist(['슬램덩크','귀멸의 칼날','원피스','명탐정 코난','드래곤볼'].map((title,i)=>({id:String(i),title,author:'작가',note:'보존할 메모',createdAt:1700000000000,photo,photos:[photo,photo],folder:i<2?'판매 사진':i<4?'소장용':'',volumes:[{number:1,status:i===0?'거래중':'보유중'}]})),['판매 사진','소장용','빈 폴더','긴 이름의 폴더도 안전하게 표시','다섯째 폴더']);}""")
  assert await page.locator('.folder-tile:visible').count()==4
  await page.locator('#expand-folders').click();assert await page.locator('.folder-tile:visible').count()==7
  await page.locator('[data-folder-filter="folder:빈 폴더"]').click();assert await page.locator('.book-card').count()==0
  await page.locator('[data-folder-filter=all]').click();await page.locator('#expand-folders').click()
  for i,color in enumerate(['yellow','red','blue','green']):
   card=page.locator('.book-card').filter(has=page.locator('h3',has_text=['슬램덩크','귀멸의 칼날','원피스','명탐정 코난'][i]));await card.locator('.book-favorite').click()
   assert not await page.locator('#detail').evaluate('n=>n.open')
   await page.locator(f'[data-favorite-color={color}]').click();await page.wait_for_function('!saveBusy')
   assert await page.evaluate(f'books[{i}].favorite')==color
  for color,title in [('yellow','슬램덩크'),('red','귀멸의 칼날'),('blue','원피스'),('green','명탐정 코난')]:
   await page.locator(f'[data-favorite-filter={color}]').click();assert await page.locator('.book-card h3').all_text_contents()==[title]
  await page.locator('[data-folder-filter="folder:판매 사진"]').click();assert await page.locator('.book-card').count()==0
  await page.locator('[data-favorite-filter=any]').click();assert await page.locator('.book-card').count()==2
  await page.locator('#search').fill('귀멸');assert await page.locator('.book-card').count()==1
  await page.locator('#search').fill('');await page.locator('[data-folder-filter=all]').click()
  await page.locator('[data-favorite-filter=none]').click();assert await page.locator('.book-card h3').all_text_contents()==['드래곤볼']
  await page.locator('[data-favorite-filter=all]').click();original=await page.evaluate('books')
  await page.reload();await page.wait_for_function('ready');assert await page.evaluate('books')==original
  await page.locator('.book-card').first.click();await page.locator('#detail-favorite .book-favorite').click();await page.locator('[data-favorite-color=red]').click();await page.wait_for_function('!saveBusy')
  assert 'red' in await page.locator('#detail-favorite .book-favorite').get_attribute('class')
  await page.locator('#detail .close').click();await page.locator('.book-card').first.locator('.book-favorite').focus();await page.keyboard.press('Enter');assert await page.locator('#favorites-dialog').evaluate('n=>n.open');assert not await page.locator('#detail').evaluate('n=>n.open');await page.locator('[data-favorite-color=""]').click();await page.wait_for_function('!saveBusy');assert await page.evaluate('books[0].favorite')==''
  await page.locator('#backup').click()
  async with page.expect_download() as download:await page.locator('#save-backup').click()
  file=await (await download.value).path();backup=json.loads(Path(file).read_text());assert backup['books'][1]['favorite']=='red' and len(backup['books'][1]['photos'])==2
  original=await page.evaluate('books');await page.evaluate('persist([])');page.once('dialog',lambda d:d.accept());await page.locator('#file').set_input_files(str(file));await page.wait_for_function('books.length===5 && !saveBusy');assert await page.evaluate('books')==original
  for theme in ['forest','cream','blue','sunny','blossom','dark']:
   await page.evaluate('theme=>setTheme(theme)',theme);await page.screenshot(path=f'/tmp/chaekjang170-{theme}.png',full_page=True)
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  await ctx.close();print('PASS: visual folder cards, expand/collapse, all four favorite colors, combined filters/search, keyboard star, detail changes, reload, exact photos/notes/state and backup/restore, six themes without horizontal overflow.')
asyncio.run(main())
