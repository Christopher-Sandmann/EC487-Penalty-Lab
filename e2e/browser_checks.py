"""Executable Chromium checks for the v3 standalone document.
Requires Python playwright and Chromium. Not a Supabase or physical-phone test.
Run: python e2e/browser_checks.py  (CHROMIUM_PATH may override the binary.)
"""
import asyncio, json, statistics, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'Penalty-Lab-Preview.html').read_text()
CARDS=json.loads((ROOT/'content/teaching-cards.json').read_text())
OUT=ROOT/'docs/screenshots'
RESULT={'harness':'Chromium: embedded standalone, real browser UI; fake clock for full-game functional checks only','cloud_tested':False,'native_mobile_tested':False,'checks':[],'performance':[]}
def ok(name,**extra):
 RESULT['checks'].append({'name':name,'passed':True,**extra});print('PASS',name,flush=True)
async def no_overflow(page):
 return await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
async def onboarding(page):
 await page.locator('#username').fill('Corner Solution')
 await page.locator('[data-side="micro"]').click()
 await page.locator('#join-button').click()
 await page.locator('#prepare').wait_for()
async def functional(browser,width,mobile):
 ctx=await browser.new_context(viewport={'width':width,'height':900 if not mobile else 800},is_mobile=mobile,has_touch=mobile,reduced_motion='reduce')
 page=await ctx.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 await page.clock.install()
 await page.set_content(HTML,wait_until='domcontentloaded');await page.locator('#username').wait_for()
 assert await page.locator('[data-economist],.candidate,#confirm-vote').count()==0
 assert await page.locator('#sound-toggle').get_attribute('aria-pressed')=='false'
 assert await no_overflow(page)
 await page.screenshot(path=str(OUT/f'home-{width}.png'),full_page=True)
 await onboarding(page)
 names=[];roles=[]
 for i in range(12):
  print('STEP',width,i,'prepare',flush=True)
  await page.locator('#prepare').wait_for()
  assert await page.locator('[data-probability]').count()==4
  assert sorted(await page.locator('[data-probability] b').all_text_contents())==['59.11%','71.22%','93.10%','94.10%']
  assert await page.locator('[data-choice]').count()==0
  await page.keyboard.press('ArrowLeft')
  assert await page.locator('#seconds').inner_text()=='↔'
  await page.clock.run_for(2700)
  assert await page.locator('#prepare').is_enabled()
  if i==0:await page.screenshot(path=str(OUT/f'flashcard-{width}.png'),full_page=True)
  await page.locator('#prepare').click();await page.locator('[data-choice="micro"]').wait_for()
  assert await page.locator('.probability-projection').count()==0
  assert await no_overflow(page)
  side='micro' if i%2==0 else 'macro'
  for a in await page.locator('[data-choice]').all():
   b=await a.bounding_box();assert b['height']>=48 and b['width']>=120
  if i==0:
   await page.screenshot(path=str(OUT/f'choices-{width}.png'),full_page=True)
   await page.locator('[data-nav="statistics"]').click();await page.clock.run_for(80)
   await page.locator('#return-live').wait_for();await page.locator('#return-live').click();await page.clock.run_for(80)
  if mobile:await page.locator(f'[data-choice="{side}"]').tap()
  else:
   await page.locator('[data-choice="micro"]').focus()
   await page.keyboard.press('ArrowLeft' if side=='micro' else 'ArrowRight')
  await page.clock.run_for(3600);await page.locator('#continue').wait_for()
  card=page.locator('.teaching-card');names.append(await card.get_attribute('data-card'))
  assert await page.locator('.teaching-text').inner_text()==CARDS[i]['text']
  assert names[-1]==CARDS[i]['id']
  assert await page.locator('.history-token').count()==i+1
  last=page.locator('.history-token').last;description=await last.get_attribute('aria-label')
  is_striker='striker' in (await last.get_attribute('class')).split()
  roles.append('striker' if is_striker else 'goalkeeper')
  assert (f'Striker chose' in description and f'({side})' in description) if is_striker else f'goalkeeper chose {side}' in description
  assert ('success' in (await last.get_attribute('class'))) == ('You win.' in description)
  assert await last.locator('b').inner_text() in ('N','U')
  await last.click();assert await page.locator('#history-detail').inner_text()==description
  if i in (0,8):
   assert await no_overflow(page)
   await page.screenshot(path=str(OUT/f'feedback-{i+1:02}-{width}.png'),full_page=True)
  if i==0:
   assert await page.locator('#continue').is_disabled()
   assert await page.locator('.feedback-pitch').is_visible()
   await page.locator('#replay').click()
  print('STEP',width,i,'read',flush=True)
  await page.clock.run_for(5500);assert await page.locator('#continue').is_enabled()
  print('STEP',width,i,'continue',flush=True)
  await page.locator('#continue').click();await page.clock.run_for(300)
  print('STEP',width,i,'continued',flush=True)
 await page.locator('.final').wait_for()
 assert names==[c['id'] for c in CARDS]
 assert roles.count('striker')==6 and roles.count('goalkeeper')==6
 assert await page.locator('.history-token.striker').count()==6
 assert await page.locator('.history-token.goalkeeper').count()==6
 assert await no_overflow(page)
 await page.screenshot(path=str(OUT/f'completion-{width}.png'),full_page=True)
 ok(f'{width}px complete game: twelve reminders, four correct probabilities, private choices, six strikes and six keeps')
 ok(f'{width}px exact twelve instructor texts, in order; no economist selection or referee')
 ok(f'{width}px persistent history: correct role shape, personal win/loss and striker N/U; detail tap works')
 await page.locator('[data-final-nav="statistics"]').click();await page.clock.run_for(100)
 h=await page.locator('.page-head h1').inner_text();assert 'Are statistical frequencies' in h and 'distinct from predicted play?' in h
 assert await page.locator('.frequency').count()==4
 assert await page.locator('.history-token').count()==12
 for f in ('macro','micro','all'):
  await page.locator('#opponent-filter').select_option(f);assert await page.locator('.frequency').count()==4
 assert await no_overflow(page)
 await page.screenshot(path=str(OUT/f'statistics-{width}.png'),full_page=True)
 await page.locator('[data-nav="notes"]').click();await page.clock.run_for(100)
 assert await page.locator('.note-card').count()==12
 assert await page.locator('.history-token').count()==12
 assert await no_overflow(page)
 ok(f'{width}px frequencies-first statistics, four charts and prescribed opponent filters; all twelve boxes accessible')
 assert not errors,errors
 ok(f'{width}px keyboard/touch, 48px+ action targets, reduced-motion and no horizontal overflow or JavaScript errors')
 await ctx.close()
async def performance(browser):
 for width,height,dpr,mobile in [(1440,1000,1,False),(360,800,2,True)]:
  ctx=await browser.new_context(viewport={'width':width,'height':height},device_scale_factor=dpr,is_mobile=mobile,has_touch=mobile)
  page=await ctx.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(HTML,wait_until='domcontentloaded');await page.locator('#username').wait_for()
  await page.locator('#join-sound').check();await onboarding(page);await page.wait_for_timeout(2700);await page.locator('#prepare').click()
  await page.locator('[data-choice="macro"]').wait_for()
  await page.evaluate('window.__PENALTY_PERF__={deltas:[],frames:0}')
  await page.wait_for_timeout(1800);await page.locator('[data-choice="macro"]').click();await page.wait_for_timeout(2400)
  perf=await page.evaluate('window.__PENALTY_PERF__');ds=perf['deltas'][8:];assert len(ds)>100
  entry={'audio_enabled':True,'viewport':f'{width}x{height}','device_pixel_ratio':dpr,'mobile_emulation':mobile,'frames_sampled':len(ds),'mean_frame_ms':round(statistics.mean(ds),3),'median_frame_ms':round(statistics.median(ds),3),'p95_frame_ms':round(sorted(ds)[int(.95*(len(ds)-1))],3),'mean_fps':round(1000/statistics.mean(ds),2),'frames_over_25ms':sum(x>25 for x in ds),'max_frame_ms':round(max(ds),3)}
  RESULT['performance'].append(entry);print('PERF',json.dumps(entry),flush=True)
  assert not errors,errors
  ok(f'{width}px real-time animated shot and feedback run without JavaScript errors')
  await ctx.close()
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  try:
   await functional(browser,1440,False);await functional(browser,360,True);await performance(browser)
  finally:
   RESULT['browser_version']=browser.version
   (ROOT/'docs/browser-results.json').write_text(json.dumps(RESULT,indent=2)+'\n');await browser.close()
if __name__=='__main__':asyncio.run(main())
