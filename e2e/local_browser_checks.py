"""Local two-human browser transport, reload and shared-identity regression.
Creates only an isolated temporary rehearsal server. Never accesses a cloud room.
"""
import asyncio,json,os,subprocess,tempfile,urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 out={'cloud_tested':False,'native_mobile_tested':False,'checks':[]}
 with tempfile.TemporaryDirectory(prefix='penalty-browser-') as d:
  token='private-test-token';state=Path(d)/'state.json'
  proc=subprocess.Popen(['node','scripts/server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'0','PENALTY_STATE_FILE':str(state),'PENALTY_LOCAL_HOST_TOKEN':token},stdout=subprocess.PIPE,text=True)
  try:
   while True:
    line=proc.stdout.readline()
    if line.startswith('Address: '):base=line.split('Address: ')[1].strip();break
   def request(action,auth=None,args=None,host=False):
    r=urllib.request.Request(base+'/api/'+action,data=json.dumps(args or {}).encode(),headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+auth} if auth else {}),**({'X-Local-Host-Token':token} if host else {})})
    with urllib.request.urlopen(r,timeout=10) as f:return json.load(f)
   hostauth=request('session')['token']
   async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
     ca=await browser.new_context(viewport={'width':1280,'height':1000});cb=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
     a=await ca.new_page();b=await cb.new_page();errors=[]
     for x in [a,b]:x.on('pageerror',lambda e:errors.append(str(e)))
     await asyncio.gather(a.goto(base,timeout=10000),b.goto(base,timeout=10000))
     for page,name,pref in [(a,'Browser A','micro'),(b,'Browser B','macro')]:
      await page.locator('#username').fill(name);await page.locator(f'[data-side="{pref}"]').click();await page.locator('#join-button').click()
      await page.locator('.waiting-overlay').wait_for()
     request('host',hostauth,{'code':'LOCAL','action':'start'},True)
     await asyncio.gather(a.locator('#prepare').wait_for(),b.locator('#prepare').wait_for())
     first=json.loads(state.read_text())['store'];assert len(first['players'])==2
     original=first['matches'][0]['id']
     await a.reload();await a.locator('#prepare').wait_for();await a.wait_for_timeout(2800)
     assert await a.locator('.probability-projection').count()==1
     assert len(json.loads(state.read_text())['store']['players'])==2
     out['checks'].append('Two independent browser profiles join a real local server; reload recovers the same briefing and identity')
     await a.locator('#prepare').click();await a.wait_for_timeout(300)
     assert await a.locator('[data-choice]').count()==0 and await b.locator('[data-choice]').count()==0
     await b.locator('#prepare').tap();await asyncio.gather(a.locator('[data-choice="micro"]').wait_for(),b.locator('[data-choice="macro"]').wait_for())
     out['checks'].append('The first acknowledgement waits; the second opens choices on both browsers')
     await a.locator('[data-choice="micro"]').click();await a.locator('.locked-banner').wait_for()
     assert await b.locator('[data-choice="macro"]').count()==1
     assert await b.locator('.locked-banner').count()==0
     await a.reload();await a.locator('.locked-banner').wait_for();assert 'MICRO' in await a.locator('.locked-banner').inner_text()
     await b.locator('[data-choice="macro"]').tap()
     await asyncio.gather(a.locator('#continue').wait_for(),b.locator('#continue').wait_for())
     out['checks'].append('Reload after first choice preserves the lock; the other browser can independently commit')
     await a.wait_for_timeout(300);st=json.loads(state.read_text())['store']
     assert st['drawCount']==1 and len(st['matches'])==1 and st['matches'][0]['id']==original
     assert all(x['kicks']+x['keeps']==1 for x in st['players'])
     assert await a.locator('.result-card.win').count()+await b.locator('.result-card.win').count()==1
     assert await a.locator('.teaching-card').get_attribute('data-card')==await b.locator('.teaching-card').get_attribute('data-card')
     out['checks'].append('Both clients show the same single-draw result, complementary wins and the same first teaching box')
     await a.reload();await a.locator('#continue').wait_for()
     tab=await ca.new_page();await tab.goto(base);await tab.locator('#continue').wait_for()
     st=json.loads(state.read_text())['store'];assert len(st['players'])==2 and st['drawCount']==1
     assert await tab.locator('.teaching-card').get_attribute('data-card')==await a.locator('.teaching-card').get_attribute('data-card')
     out['checks'].append('Feedback reload and an additional tab recover the pending card without duplicating identity or outcome')
     assert not errors,errors
     out['checks'].append('No uncaught JavaScript errors in the live local-browser rehearsal')
     out['passed']=True
    finally:await browser.close()
  except Exception as e:
   out['passed']=False;out['error']=str(e);raise
  finally:
   proc.terminate();proc.wait(timeout=8)
   (ROOT/'docs/local-browser-results.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':asyncio.run(main())
