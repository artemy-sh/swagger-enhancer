const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

test('editable site tags activate custom URLs, keep Swagger detection and allow removing default rules', {timeout:90000}, async t=>{
  const swagger=require('swagger-ui-dist').getAbsoluteFSPath();
  const spec={openapi:'3.0.3',info:{title:'Site settings fixture',version:'1'},paths:{'/pets':{get:{tags:['Pets'],responses:{200:{description:'OK'}}}}}};
  const serve=(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(['/swagger-ui-bundle.js','/swagger-ui.css'].includes(url.pathname)){
      res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');
      fs.createReadStream(path.join(swagger,path.basename(url.pathname))).pipe(res); return;
    }
    if(url.pathname==='/init.js'){
      res.setHeader('Content-Type','application/javascript; charset=utf-8');
      res.end(`SwaggerUIBundle({spec:${JSON.stringify(spec)},dom_id:'#swagger',validatorUrl:null})`);return;
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"script-src 'self'; object-src 'none'");
    res.end(url.searchParams.has('plain')?'<!doctype html><main>Reference home</main>':'<!doctype html><link rel="stylesheet" href="/swagger-ui.css"><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script>');
  };
  const server=http.createServer(serve), other=http.createServer(serve);
  await Promise.all([new Promise(r=>server.listen(0,'127.0.0.1',r)),new Promise(r=>other.listen(0,'127.0.0.1',r))]);
  t.after(()=>Promise.all([new Promise(r=>server.close(r)),new Promise(r=>other.close(r))]));
  const origin='http://127.0.0.1:'+server.address().port;
  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
  t.after(()=>context.close());
  const errors=[];
  context.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'||/message port closed|Message not delivered|Could not register Swagger sites/.test(message.text()))errors.push(message.text());});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await expect.poll(()=>worker.evaluate(()=>chrome.storage.sync.get('darkThemeEnabled'))).toEqual({darkThemeEnabled:false});
  const extensionId=new URL(worker.url()).host;
  const custom=await context.newPage();await custom.goto(origin+'/reference');
  await expect(custom.locator('.opblock')).toHaveCount(1);
  assert.equal(await custom.locator('#swagger-floating-menu').count(),0);
  const nativeCopyStyle = page => page.locator('.opblock-summary > .copy-to-clipboard').evaluate(el => {
    const style = getComputedStyle(el);
    return { width: style.width, height: style.height, display: style.display, color: style.color };
  });
  await custom.locator('.opblock-summary').hover();
  await expect(custom.locator('.opblock-summary > .copy-to-clipboard')).toHaveCSS('width','24px');
  const originalCopyStyle = await nativeCopyStyle(custom);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#swagger-site-settings summary').click();
  await expect(popup.locator('.swagger-site-tag')).toHaveCount(3);
  const input=popup.locator('#swagger-site-input'), save=popup.locator('#swagger-site-save');
  await expect(input).toBeEnabled();
  await input.fill(origin+'/reference, example.test');
  await save.click();
  await expect(popup.locator('#swagger-site-status')).toContainText('Saved. Reload');
  await expect(popup.locator('.swagger-site-tag')).toHaveCount(5);
  const scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
  assert.equal(scripts.length,2);
  assert.ok(scripts.some(script=>script.world==='MAIN'&&script.runAt==='document_start'));
  await custom.reload();
  await expect(custom.locator('#swagger-floating-menu')).toBeVisible();
  await expect(custom.locator('.swagger-fav-star')).toHaveCount(1);
  await custom.reload();
  await expect(custom.locator('#swagger-floating-menu')).toHaveCount(1);
  await expect(custom.locator('.swagger-fav-star')).toHaveCount(1);

  await input.fill('ftp://bad.example.test');await save.click();
  await expect(popup.locator('#swagger-site-error')).toBeVisible();
  assert.equal((await worker.evaluate(()=>chrome.storage.sync.get('swaggerSiteRules'))).swaggerSiteRules.length,5);
  await input.fill('');
  await popup.getByRole('button',{name:'Remove *://*/*docs*',exact:true}).click();
  await save.click();await expect(popup.locator('#swagger-site-status')).toContainText('Saved. Reload');
  const standard=await context.newPage();await standard.goto(origin+'/docs');
  await expect(standard.locator('.opblock')).toHaveCount(1);
  assert.equal(await standard.locator('#swagger-floating-menu').count(),0);
  await standard.locator('.opblock-summary').hover();
  await expect.poll(()=>nativeCopyStyle(standard)).toEqual(originalCopyStyle);
  await standard.goto(origin+'/swagger/index.html');
  await expect(standard.locator('#swagger-floating-menu')).toBeVisible();
  const wrongPort=await context.newPage();await wrongPort.goto('http://127.0.0.1:'+other.address().port+'/reference');
  await expect(wrongPort.locator('.opblock')).toHaveCount(1);
  assert.equal(await wrongPort.locator('#swagger-floating-menu').count(),0);
  const ordinary=await context.newPage();await ordinary.goto(origin+'/reference?plain=1');
  await expect(ordinary.locator('main')).toHaveText('Reference home');
  assert.equal(await ordinary.locator('#swagger-floating-menu').count(),0);

  while(await popup.locator('.swagger-site-tag button').count())await popup.locator('.swagger-site-tag button').first().click();
  await save.click();await expect(popup.locator('#swagger-site-status')).toHaveText('Saved. No sites enabled.');
  await expect(custom.locator('#swagger-floating-menu')).toHaveCount(0);
  await expect(standard.locator('#swagger-floating-menu')).toHaveCount(0);
  await standard.locator('.opblock-summary').hover();
  await expect.poll(()=>nativeCopyStyle(standard)).toEqual(originalCopyStyle);
  await custom.reload();await expect(custom.locator('.opblock')).toHaveCount(1);
  assert.equal(await custom.locator('#swagger-floating-menu').count(),0);
  await popup.getByRole('button',{name:'Restore defaults',exact:true}).click();
  await save.click();await expect(popup.locator('#swagger-site-status')).toContainText('Saved. Reload');
  await standard.goto(origin+'/docs');await expect(standard.locator('#swagger-floating-menu')).toBeVisible();
  assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,0);
  assert.deepEqual(errors,[]);
});
