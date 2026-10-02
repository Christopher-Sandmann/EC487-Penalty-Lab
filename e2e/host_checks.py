"""Embedded Chromium host-navigation check with an explicit transport fixture.
Not a backend, network or Supabase test. Exercises actual compiled frontend UI.
"""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
FIXTURE='''
import {LocalTransport} from 'penalty:/lib/api.js';
window.__hostCalls=[];const rooms={};
const stats=code=>({serverNow:Date.now(),room:rooms[code],players:[],matches:[],counts:{connected:0,disconnected:0}});
LocalTransport.prototype.call=async function(action,args={}){
 window.__hostCalls.push({action,code:this.code,args});
 if(action==='host/create'){rooms[this.code]={id:this.code,code:this.code,host:'fixture',phase:'lobby',entryOpen:true,showBenchmarks:true,practice:true,createdAt:Date.now(),nextSerial:0,version:1};return {};}
 if(action==='statistics')return stats(this.code);
 if(action==='host'){if(args.action==='end')rooms[this.code].phase='ended';rooms[this.code].version++;return {};}
 if(action==='join')throw new Error('Fixture recorded player join into '+this.code);
 throw new Error('Unexpected fixture call: '+action);
};
await import('penalty:/app.js');
'''
async def main():
 html=(ROOT/'Penalty-Lab-Preview.html').read_text().replace("window.PENALTY_CONFIG={mode:'practice'}", "window.PENALTY_CONFIG={mode:'local',defaultRoom:'LOCAL'}").replace("import 'penalty:/app.js';",FIXTURE)
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  await page.set_content(html,wait_until='domcontentloaded');await page.locator('#host-link').click()
  await page.locator('#host-token').fill('fixture-token');await page.locator('#host-code').fill('TEST01');await page.locator('[name=operation][value=create]').click()
  await page.locator('#switch-host-room').wait_for();assert '#host?room=TEST01'==await page.evaluate('location.hash')
  await page.locator('[data-nav=statistics]').click();await page.get_by_role('heading',name='Observed choices. Predicted frequencies.').wait_for()
  assert await page.locator('.history-token').count()==0
  old=await page.evaluate("__hostCalls.filter(c=>c.action==='statistics').length");await page.wait_for_timeout(3700)
  assert await page.evaluate("__hostCalls.filter(c=>c.action==='statistics').length")>old
  await page.locator('#host-link').click();await page.locator('[data-host-action=end]').click();await page.locator('#switch-host-room').click()
  await page.locator('#host-token').fill('fixture-token');await page.locator('#host-code').fill('EC487');await page.locator('[name=operation][value=create]').click()
  await page.locator('#switch-host-room').wait_for();await page.locator('[data-nav=play]').click()
  await page.locator('#username').fill('Test alias');await page.locator('[data-side=micro]').click();await page.locator('#join-button').click()
  await page.wait_for_timeout(100)
  assert await page.evaluate("__hostCalls.findLast(c=>c.action==='join').code")=='EC487'
  assert not errors,errors
  result={'checks':[{'name':'Host statistics without joining; refresh; switch/create another room; player transport follows host room','passed':True}], 'backend_tested':False,'transport':'Explicit in-memory fixture','browser_version':b.version}
  (ROOT/'docs/host-ui-results.json').write_text(json.dumps(result,indent=2)+'\n');print('PASS',result['checks'][0]['name']);await b.close()
asyncio.run(main())
