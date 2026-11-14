const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
for(const pkg of ['swagger-ui-dist','swagger-ui-legacy']){
 test(`${pkg}: inline schema previews, references, themes, collapse and full-schema navigation`,{timeout:90000},async t=>{
  const swagger=require(pkg).getAbsoluteFSPath();
  const longName='AdminCatalogGetFacetPaginatedResponse';
  const spec={openapi:pkg==='swagger-ui-dist'?'3.1.0':'3.0.3',info:{title:'Schema preview fixture',version:'1'},paths:{'/pets':{get:{tags:['Pets'],description:`Inspect [Pet schema](#/components/schemas/Pet), [Empty schema](#/components/schemas/Empty) or [Facets schema](#/components/schemas/${longName}).`,responses:{200:{description:'OK'}}}}},components:{schemas:{
    ...Object.fromEntries(Array.from({length:120},(_,i)=>['Admin'+i,{type:'object',properties:{id:{type:'integer'}}}])),
    Pet:{type:'object',description:'A pet returned by the API.',required:['id'],properties:{id:{type:'integer',format:'int64',description:'Unique identifier.'},name:{type:'string'},status:{type:'string',enum:['available','adopted']},owner:{$ref:'#/components/schemas/Owner'},meta:{type:'object',properties:{source:{type:'string'}}}}},
    Owner:{type:'object',properties:{name:{type:'string'},pet:{$ref:'#/components/schemas/Pet'}}},Empty:{type:'object'},
    [longName]:{type:'object',description:'Available filters for the catalog.',required:['category_identifier'],
      properties:{category_identifier:{type:'array',items:{$ref:'#/components/schemas/FacetItemList'},description:'Filter by category.'},
        matching_item_count:{type:'integer',format:'int64',description:'Number of items matching the current filters.'}}},
    FacetItemList:{type:'object',description:'Facet counts and selected values for the current filter.',properties:{
      total_facets_count:{type:'integer',description:'Total number of available facets.'},
      facets:{type:'object',description:'Available values and their counts.'},
      selected_facets:{type:'array',items:{type:'object'},description:'Values currently selected.'}}}
  }}};
  const server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost');
   if(['/swagger-ui-bundle.js','/swagger-ui.css'].includes(url.pathname)){
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');fs.createReadStream(path.join(swagger,path.basename(url.pathname))).pipe(res);return;
   }
   if(url.pathname==='/spec'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(spec));return;}
   if(url.pathname==='/init.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(`window.fixtureUI=SwaggerUIBundle({url:'/spec',dom_id:'#swagger',validatorUrl:null,docExpansion:'list'})`);return;}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"script-src 'self'; object-src 'none'");
   res.end('<!doctype html><link rel="stylesheet" href="/swagger-ui.css"><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;
  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});t.after(()=>context.close());
  const errors=[];context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await expect.poll(()=>worker.evaluate(()=>chrome.storage.sync.get('hideSchemasEnabled'))).toEqual({hideSchemasEnabled:false});
  await worker.evaluate(()=>chrome.storage.sync.set({hideSchemasEnabled:true}));
  const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin+'/docs');
  await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
  const popup=await context.newPage();await popup.goto('chrome-extension://'+new URL(worker.url()).host+'/popup.html');
  const toggle = async (id, value) => {
    const input = popup.locator('#' + id); await expect(input).toBeEnabled();
    if (await input.isChecked() !== value) await input.locator('..').click();
    await expect(input).toBeChecked({ checked: value }); await expect(input).toBeEnabled();
  };
  await toggle('schemaPreviewToggle', true);
  if (await page.locator('.opblock-summary-control').getAttribute('aria-expanded') !== 'true') await page.locator('.opblock-summary-control').click();
  const link=page.getByRole('link',{name:'Pet schema',exact:true});const panel=page.locator('#swagger-schema-preview');
  const shot=async name=>{if(process.env.SWAGGER_TEST_SCREENSHOTS){fs.mkdirSync(process.env.SWAGGER_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-${name}.png`)});}};
  for(const dark of [false,true]){
   await toggle('toggle', dark);
   await link.click();await expect(panel).toBeVisible();await expect(panel.getByRole('heading',{name:'Pet',exact:true})).toBeVisible();
   await expect(panel).toContainText('required');await expect(panel).toContainText('Unique identifier.');await expect(panel).toContainText('"available", "adopted"');
   await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
   assert.equal(page.url(),origin+'/docs');
   await expect(panel).toHaveCSS('background-color',dark?'rgb(18, 18, 18)':'rgb(255, 255, 255)');
   await shot(`schema-preview-${dark?'dark':'light'}`);
   if(process.env.SWAGGER_TEST_SCREENSHOTS)await panel.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-schema-card-${dark?'dark':'light'}.png`)});
   await panel.getByRole('button',{name:'Owner',exact:true}).click();
   await expect(panel.getByRole('heading',{name:'Owner',exact:true})).toBeVisible();
   const nestedTitle=await panel.getByRole('heading',{name:'Owner',exact:true}).boundingBox();
   const closeBox=await panel.getByRole('button',{name:'Close schema preview'}).boundingBox();
   const backBox=await panel.getByRole('button',{name:'Back',exact:true}).boundingBox();
   const fullBox=await panel.getByRole('link',{name:'Open in Schemas',exact:true}).boundingBox();
   const panelBox=await panel.boundingBox();
   assert.ok(nestedTitle.x < closeBox.x && Math.abs(nestedTitle.y - closeBox.y) < 4);
   assert.ok(Math.abs(panelBox.x + panelBox.width - closeBox.x - closeBox.width - 17) < 1);
   assert.ok(backBox.x < fullBox.x && Math.abs(backBox.y - fullBox.y) < 1);
   if(process.env.SWAGGER_TEST_SCREENSHOTS)await panel.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-nested-${dark?'dark':'light'}.png`)});
   // A tab from the previous version can still render these controls in their old positions.
   await panel.evaluate(card => {
    const header=card.querySelector('.swagger-schema-preview-header');
    const title=header.querySelector('h3');
    const back=card.querySelector('.swagger-schema-preview-back');
    const close=header.querySelector('.swagger-schema-preview-close');
    header.replaceChildren(back,title,close);
    card.querySelector('.swagger-schema-preview-full').classList.remove('swagger-schema-preview-full');
   });
   const legacyTitle=await panel.getByRole('heading',{name:'Owner',exact:true}).boundingBox();
   const legacyClose=await panel.getByRole('button',{name:'Close schema preview'}).boundingBox();
   const legacyBack=await panel.getByRole('button',{name:'Back',exact:true}).boundingBox();
   assert.ok(Math.abs(legacyTitle.x - nestedTitle.x) < 1 && Math.abs(legacyClose.x - closeBox.x) < 1);
   assert.ok(legacyBack.y >= legacyTitle.y + legacyTitle.height);
   await panel.getByRole('button',{name:'Back',exact:true}).click();await expect(panel.getByRole('heading',{name:'Pet',exact:true})).toBeVisible();
   await expect(panel.getByRole('button',{name:'Close schema preview'})).toBeFocused();
   await panel.locator('summary').filter({hasText:'Properties'}).click();await expect(panel).toContainText('source');
   await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(link).toBeFocused();
   await link.press('Enter');await expect(panel.getByRole('button',{name:'Close schema preview'})).toBeFocused();
   await panel.getByRole('button',{name:'Close schema preview'}).click();await expect(panel).toHaveCount(0);
   await page.getByRole('link',{name:'Empty schema',exact:true}).click();await expect(panel).toContainText('No properties are defined in the API specification.');
   await page.keyboard.press('Escape');
   const facets=page.getByRole('link',{name:'Facets schema',exact:true});
   await facets.click();await expect(panel.getByRole('heading',{name:longName,exact:true})).toBeVisible();
   if(process.env.SWAGGER_TEST_SCREENSHOTS)await panel.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-facets-card-${dark?'dark':'light'}.png`)});
   await page.keyboard.press('Escape');
   await page.setViewportSize({width:375,height:667});await facets.click();await expect(panel).toBeVisible();
   const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=375&&box.y>=0&&box.y+box.height<=667);
   assert.ok(await panel.locator('.swagger-schema-preview-body').evaluate(el=>el.scrollWidth===el.clientWidth));
   await expect(panel.getByRole('button',{name:'Close schema preview'})).toBeVisible();
   await expect(panel.getByRole('link',{name:'Open in Schemas',exact:true})).toBeVisible();
   await shot(`schema-preview-mobile-${dark?'dark':'light'}`);
   await panel.getByRole('button',{name:'FacetItemList[]',exact:true}).click();
   await expect(panel.getByRole('heading',{name:'FacetItemList',exact:true})).toBeVisible();
   await expect(panel.getByRole('button',{name:'Back',exact:true})).toBeVisible();
   if(process.env.SWAGGER_TEST_SCREENSHOTS)await panel.screenshot({path:path.join(process.env.SWAGGER_TEST_SCREENSHOTS,`${pkg}-facets-nested-${dark?'dark':'light'}.png`)});
   await panel.getByRole('button',{name:'Close schema preview'}).click();await page.setViewportSize({width:1280,height:720});
  }
  await link.click();await panel.getByRole('link',{name:'Open in Schemas',exact:true}).click();
  await expect(panel).toHaveCount(0);await expect(page.locator('section.models')).toHaveClass(/is-open/);
  await expect(page.locator('#swagger-schema-notice')).toContainText('Opened Pet');
  await expect(page.getByRole('button',{name:'Pet',exact:true})).toBeInViewport();
  const fullModel=page.locator('article[data-json-schema-level="0"], .model-container[data-name]').filter({has:page.getByRole('button',{name:'Pet',exact:true})});
  await expect(fullModel.getByText('name',{exact:true})).toBeVisible();
  await shot('schema-full-dark');
  assert.equal(page.url(),origin+'/docs');
  await page.reload();await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
  await page.locator('.opblock-summary-control').click();
  await link.click();await expect(panel).toBeVisible();
  await page.evaluate(spec=>fixtureUI.specActions.updateJsonSpec({...spec,info:{...spec.info,version:'2'}}),spec);
  await expect(panel).toHaveCount(0);
  await link.click();await expect(panel).toBeVisible();await toggle('schemaPreviewToggle', false);await expect(panel).toHaveCount(0);
  const destinationPromise=context.waitForEvent('page');await link.click();const destination=await destinationPromise;
  await expect(destination.locator('section.models')).toHaveClass(/is-open/);
  await expect(destination.getByRole('button',{name:'Pet',exact:true})).toBeInViewport();
  const destinationModel=destination.locator('article[data-json-schema-level="0"], .model-container[data-name]').filter({has:destination.getByRole('button',{name:'Pet',exact:true})});
  await expect(destinationModel.getByText('name',{exact:true})).toBeVisible();
  await destination.close();
  assert.deepEqual(errors,[]);
 });
}
