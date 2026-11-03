const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium, expect} = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

for (const pkg of ['swagger-ui-dist', 'swagger-ui-legacy']) {
  test(`${pkg}: mouse and keyboard focus stays on controls in both themes, including popup and schema cards`, {timeout: 90000}, async t => {
    const swagger = require(pkg).getAbsoluteFSPath();
    const spec = {openapi: pkg === 'swagger-ui-dist' ? '3.1.0' : '3.0.3', info: {title:'Focus review', version:'1'}, paths:{'/pets':{get:{
      tags:['Pets'], security:[{bearerAuth:[]}], description:'Inspect [Pet schema](#/components/schemas/Pet).', responses:{200:{description:'OK'}}
    }}}, components:{securitySchemes:{bearerAuth:{type:'http', scheme:'bearer'}}, schemas:{
      Pet:{type:'object',properties:{id:{type:'integer'},owner:{$ref:'#/components/schemas/Owner'}}},
      Owner:{type:'object',properties:{name:{type:'string'}}}
    }}};
    const server = http.createServer((req,res) => {
      const url = new URL(req.url,'http://localhost');
      if (['/swagger-ui-bundle.js','/swagger-ui.css'].includes(url.pathname)) {
        res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');
        fs.createReadStream(path.join(swagger,path.basename(url.pathname))).pipe(res);return;
      }
      if (url.pathname === '/init.js') {
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.end(`SwaggerUIBundle({spec:${JSON.stringify(spec)},dom_id:'#swagger',docExpansion:'full',validatorUrl:null})`);return;
      }
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><link rel="stylesheet" href="/swagger-ui.css"><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const context = await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
    t.after(()=>context.close());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await expect.poll(()=>worker.evaluate(()=>chrome.storage.sync.get('darkThemeEnabled'))).toEqual({darkThemeEnabled:false});
    await worker.evaluate(()=>chrome.storage.sync.set({copyFullUrlEnabled:true,authorizeInHeaderEnabled:true,schemaPreviewEnabled:true}));
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror', error=>{errors.push(error.message); console.error(error.message);});
    await page.setViewportSize({width:1280,height:900});
    await page.goto(`http://127.0.0.1:${server.address().port}/docs`);
    const popup = await context.newPage();
    await popup.setViewportSize({width:320,height:720});
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await expect(page.locator('#swagger-floating-menu')).toBeVisible();
    await expect(page.locator('.opblock')).toHaveCount(1);
    await expect(page.locator('.swagger-fav-star')).toHaveCount(1);
    await expect(page.locator('.swagger-copy-link')).toHaveCount(3);
    const suppressActions = target => target.evaluate(()=>{
      // Isolate native focus from each button's action. Functionality is covered
      // separately, while real mouse/keyboard input still drives focus here.
      window.stopFocusAuditClick = event=>{event.preventDefault();event.stopImmediatePropagation();};
      document.addEventListener('click',window.stopFocusAuditClick,true);
    });
    const restoreActions = target => target.evaluate(()=>document.removeEventListener('click',window.stopFocusAuditClick,true));
    const containersQuiet = target => expect.poll(()=>target.locator('#swagger-floating-menu, .swagger-menu-left, .swagger-menu-right, #swagger-fav-control, #swagger-search-container, .toggle-container, #swagger-support-panel').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).outlineStyle==='none'))).toBe(true);
    const audit = async (target,control,ring=control) => {
      await control.click();
      await expect(control).toBeFocused();
      await expect(ring).toHaveCSS('outline-style','none');
      await containersQuiet(target);
      await target.keyboard.press('Tab');
      await control.focus();
      await expect(control).toBeFocused();
      await expect.poll(()=>ring.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
      await containersQuiet(target);
      await control.click();
      await expect(ring).toHaveCSS('outline-style','none');
    };
    const shot = async (target,name) => {
      if (!process.env.SWAGGER_TEST_SCREENSHOTS) return;
      fs.mkdirSync(process.env.SWAGGER_TEST_SCREENSHOTS,{recursive:true});
      await target.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-focus-${name}.png`)});
    };
    for (const dark of [false,true]) {
      await worker.evaluate(value=>chrome.storage.sync.set({darkThemeEnabled:value}),dark);
      await popup.reload();
      await expect(popup.locator('#container')).toHaveClass(dark?'dark':'light');
      await expect(page.locator('html')).toHaveClass(dark?/swagger-dark-theme/:/^(?!.*swagger-dark-theme)/);
      await page.bringToFront();
      await suppressActions(page);
      for (const selector of ['#swagger-fav-filter','.swagger-fav-label','.swagger-fav-all','.swagger-fav-reset','#swagger-extension-review','#swagger-header-authorize',
        '.swagger-fav-star','.opblock-summary-control','.swagger-copy-docs-url','.swagger-copy-full-url','.swagger-copy-path-url','.swagger-route-authorization',
        '.try-out__btn','.models-control',pkg==='swagger-ui-dist'?'.json-schema-2020-12-accordion':'.model-box-control']) {
        await audit(page,page.locator(selector).first());
      }
      await page.locator('#swagger-fav-filter').click();
      await shot(page,`${dark?'dark':'light'}-mouse`);
      const search = page.locator('.swagger-search-input');
      await search.click();
      await expect(search).toHaveCSS('outline-style','none');
      await expect.poll(()=>search.evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
      await containersQuiet(page);
      await page.evaluate(()=>{document.body.style.minHeight='2800px';scrollTo(0,700);});
      await audit(page,page.locator('#swagger-scroll-top'));
      await restoreActions(page);
      await page.getByRole('link',{name:'Pet schema',exact:true}).click();
      const card = page.locator('#swagger-schema-preview');
      await expect(card).toBeVisible();
      await card.getByRole('button',{name:'Owner',exact:true}).click();
      await suppressActions(page);
      for (const control of [card.getByRole('button',{name:'Back',exact:true}),card.getByRole('button',{name:'Close schema preview'}),card.getByRole('link',{name:'Open in Schemas'})]) await audit(page,control);
      await expect(card).toHaveCSS('outline-style','none');
      await restoreActions(page);
      await page.keyboard.press('Escape');
      await expect(card).toHaveCount(0);
      await popup.bringToFront();
      // Saving disables and refocuses a checkbox. This must not invent a ring
      // after a mouse click, even if Chromium treats restored focus as visible.
      const favorite = popup.locator('#favoritesToggle');
      for (let i=0;i<2;i++) {
        await popup.locator('label[for="favoritesToggle"]').click();
        await expect(favorite).toBeEnabled();
        await expect(favorite.locator('..').locator('.slider')).toHaveCSS('outline-style','none');
        await containersQuiet(popup);
      }
      await popup.locator('#swagger-site-settings summary').click();
      for (const input of await popup.locator('.switch input').all()) {
        // The hidden native checkbox receives focus through its visible label.
        const label = input.locator('..');
        await label.click();await expect(input).toBeFocused();
        const slider = label.locator('.slider');
        await expect(input).toBeEnabled();
        await expect(slider).toHaveCSS('outline-style','none');
        await popup.keyboard.press('Tab');await input.focus();
        await expect(slider).toHaveCSS('outline-style','solid');
        await containersQuiet(popup);
        await label.click();await expect(input).toBeEnabled();
        await expect(slider).toHaveCSS('outline-style','none');
      }
      await suppressActions(popup);
      for (const selector of ['#swagger-site-settings summary','.swagger-site-tag button','#swagger-site-save','#swagger-site-defaults','[data-support-review]','[data-support-share]','.swagger-support-issue']) await audit(popup,popup.locator(selector).first());
      await shot(popup,`${dark?'dark':'light'}-settings`);
      await restoreActions(popup);
      await popup.locator('#swagger-site-input').click();
      await expect(popup.locator('#swagger-site-input')).toHaveCSS('outline-style','none');
      await expect(popup.locator('#swagger-site-tags')).toHaveCSS('outline-style','solid');
      await expect(popup.locator('#swagger-site-settings')).toHaveCSS('outline-style','none');
      await popup.locator('#swagger-site-settings summary').click();
    }
    assert.equal(context.pages().length,3,'Focus checks never follow external rating or issue links');
    assert.deepEqual(errors,[]);
  });
}
