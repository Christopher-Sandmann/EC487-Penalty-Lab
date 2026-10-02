"""Chromium audio scheduling + haptic-call checks. No physical vibration/audibility claim."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.add_init_script('window.__unused=true')
  await page.set_content('<html><body></body></html>')
  await page.evaluate('''() => {
    window.__vibes=[];window.__effects=[];window.__starts=0;window.__stops=0;
    Object.defineProperty(navigator,'vibrate',{configurable:true,value:(p)=>{__vibes.push(p);return true;}});
    document.addEventListener('penalty:effect',e=>__effects.push(e.detail));
    const orig=AudioScheduledSourceNode.prototype.start,stop=AudioScheduledSourceNode.prototype.stop;
    AudioScheduledSourceNode.prototype.start=function(...args){__starts++;return orig.apply(this,args);};
    AudioScheduledSourceNode.prototype.stop=function(...args){__stops++;return stop.apply(this,args);};
  }''')
  await page.set_content((ROOT/'Penalty-Lab-Preview.html').read_text(),wait_until='domcontentloaded')
  await page.locator('#username').wait_for()
  await page.evaluate("document.addEventListener('penalty:effect',e=>__effects.push(e.detail))")
  assert await page.locator('#sound-toggle').get_attribute('aria-pressed')=='false'
  assert await page.locator('#haptics-toggle').is_enabled()
  await page.locator('#join-sound').check();await page.wait_for_timeout(100)
  assert await page.locator('#sound-toggle').get_attribute('aria-pressed')=='true'
  assert await page.evaluate('__starts')>0
  await page.locator('#username').fill('Audio Check');await page.locator('[data-side="micro"]').click();await page.locator('#join-button').click()
  await page.locator('#prepare').wait_for();await page.wait_for_timeout(2700);await page.locator('#prepare').click()
  await page.locator('[data-choice="micro"]').wait_for();await page.wait_for_timeout(1400)
  cues=await page.evaluate('__effects');assert any(e['cue']=='tick' and e['audio'] for e in cues)
  await page.locator('[data-choice="micro"]').click();await page.wait_for_timeout(2500)
  cues=await page.evaluate('__effects');assert any(e['cue']=='choice' for e in cues);assert any(e['cue']=='kick' for e in cues)
  assert any(e['cue'] in ['goal','save','post','wide','high'] and e['audio'] for e in cues)
  assert len(await page.evaluate('__vibes'))>0
  await page.locator('#sound-toggle').click();assert await page.locator('#sound-toggle').get_attribute('aria-pressed')=='false'
  starts=await page.evaluate('__starts');await page.wait_for_timeout(500);assert await page.evaluate('__starts')==starts
  await page.locator('#haptics-toggle').click();assert await page.locator('#haptics-toggle').get_attribute('aria-pressed')=='false'
  results.append({'name':'UI opt-in unlocks audio; live countdown, kick and result schedule sound; speaker/haptic switches work','passed':True})
  # Exercise every visual result deterministically without changing the game draw.
  await page.evaluate("async()=>{const {Effects}=await import('penalty:/lib/effects.js');window.__fx=new Effects();await __fx.setSound(true);__fx.setHaptics(true);}")
  before=await page.evaluate('__starts')
  await page.evaluate("()=>{for(const kind of ['goal','save','post','wide','high']){__fx.reveal('fixture-'+kind,1200,kind,true);__fx.reveal('fixture-'+kind,1500,kind,true);}for(let s=12;s>=1;s--){__fx.countdown('fixture-clock',s);__fx.countdown('fixture-clock',s);}}")
  cues=await page.evaluate('__effects');assert await page.evaluate('__starts')>before
  for kind in ['goal','save','post','wide','high']:assert sum(e['cue']==kind for e in cues)>=1
  assert sum(e['cue']=='urgent' for e in cues)==3
  # Once keys prevent repeat crowd sounds from retries/rerenders.
  before=await page.evaluate('__starts');await page.evaluate("__fx.reveal('fixture-goal',1700,'goal',true)");assert await page.evaluate('__starts')==before
  await page.evaluate('__fx.setSound(false);__fx.setHaptics(false)');before=await page.evaluate('__starts');v=await page.evaluate('__vibes.length')
  await page.evaluate("__fx.reveal('muted-new',1500,'goal',true);__fx.countdown('muted-new',1);__fx.choice()")
  assert await page.evaluate('__starts')==before;assert await page.evaluate('__vibes.length')==v
  results.append({'name':'All five result cues, 12 countdown ticks, last-three urgency, one-shot deduplication and mute silence','passed':True})
  assert not errors,errors
  report={'browser':b.version,'checks':results,'physical_hardware_tested':False,'cloud_tested':False,'note':'Web Audio source scheduling and a stubbed navigator.vibrate were observed; no claim that a physical phone vibrated or that a human auditioned the synthesized sound.'}
  (ROOT/'docs/effects-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2),flush=True)
  await b.close()
if __name__=='__main__':asyncio.run(main())
