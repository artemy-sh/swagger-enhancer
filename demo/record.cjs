const {chromium,expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const {capture}=require('./capture.cjs');
const output=process.env.DEMO_OUTPUT || path.join(root,'demo-output');
const origin=`http://localhost:${process.env.DEMO_PORT||4177}`;
fs.mkdirSync(path.join(output,'raw'),{recursive:true});
const beat=60/110,bar=beat*4;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const points=new WeakMap();
async function point(page,x,y){
  const previous=points.get(page)||{x:1100,y:650};
  for(let i=1;i<=16;i++){
    const t=i/16,e=t*t*(3-2*t);
    await page.mouse.move(previous.x+(x-previous.x)*e,previous.y+(y-previous.y)*e);
    await pause(12);
  }
  points.set(page,{x,y});
}
async function click(page,locator){
  const before=await locator.boundingBox();
  const height=page.viewportSize().height;
  if(!before||before.y<72||before.y+before.height>height-12)await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();
  await point(page,box.x+box.width/2,box.y+box.height/2);
  await locator.click();
}
async function toggle(s,id,value){
  const input=s.popup.locator('#'+id);await expect(input).toBeEnabled();
  if(await input.isChecked()!==value)await click(s.popup,input.locator('..'));
  await expect(input).toBeEnabled();await expect(input).toBeChecked({checked:value});
  await s.page.bringToFront();
}
async function top(s){await s.page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await pause(180);}
async function retina(page){
  const cdp=await page.context().newCDPSession(page);
  const {windowId}=await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1440,height:846}});
  await cdp.detach();
}
function mission(s){return s.page.locator('.opblock').filter({has:s.page.locator('.opblock-summary-path',{hasText:/^\/missions$/})});}
async function openMission(s){const block=mission(s);await expect(block).toBeVisible();if(!/\bis-open\b/.test(await block.getAttribute('class')))await click(s.page,block.locator('.opblock-summary-control'));await expect(block.locator('.opblock-description-wrapper').first()).toBeVisible();return block;}
async function align(s,locator,offset=105){await locator.evaluate((el,offset)=>scrollTo({top:el.getBoundingClientRect().top+scrollY-offset,behavior:'instant'}),offset);await pause(150);}
const chapters=[
  {id:'theme',bars:3,title:'Light or dark. Your call.',subtitle:'An interface that feels right, day or night.',popup:[0,2.5],
    async run(s){await pause(350);await toggle(s,'toggle',true);await expect(s.page.locator('body')).toHaveCSS('background-color','rgb(18, 18, 18)');await pause(1200);await toggle(s,'toggle',false);await pause(650);await toggle(s,'toggle',true);await pause(1300);}},
  {id:'search',bars:3,title:'Find any endpoint.',subtitle:'Search the whole API, even beyond the screen.',
    async run(s){const input=s.page.locator('.swagger-search-input');await click(s.page,input);await input.pressSequentially('maximum purr',{delay:60});await expect(s.page.locator('.swagger-search-results .route-path')).toHaveText('/cats/{catId}/mood');await pause(1000);await click(s.page,s.page.locator('.swagger-search-results .route-path'));await expect(s.page.locator('.opblock.is-open')).toContainText('Activate maximum purr');await pause(1500);}},
  {id:'favorites',bars:3,title:'Keep your essentials.',subtitle:'Show favorites. Hide favorites. Keep moving.',
    async run(s){await click(s.page,s.page.locator('.swagger-fav-star').nth(0));await click(s.page,s.page.locator('.swagger-fav-star').nth(1));await pause(450);await click(s.page,s.page.locator('#swagger-fav-filter'));await expect(s.page.locator('.opblock:visible')).toHaveCount(2);await pause(1350);await click(s.page,s.page.locator('#swagger-fav-filter'));await pause(1000);await click(s.page,s.page.locator('#swagger-fav-filter'));await pause(600);}},
  {id:'copy',bars:3,title:'Three ways to share a route.',subtitle:'Documentation link, full URL, or just the path.',popup:[0,1.7],
    async run(s){await toggle(s,'copyFullUrlToggle',true);const summary=mission(s).locator('.opblock-summary');await align(s,summary,310);await summary.locator('.opblock-summary-control').evaluate(el=>el.focus({preventScroll:true}));await expect(summary.locator('.swagger-copy-docs-url')).toHaveCSS('width','26px');for(const key of ['docs','full','path']){await click(s.page,summary.locator(`.swagger-copy-${key}-url`));await expect(summary.locator(`.swagger-copy-${key}-url .swagger-copy-hint`)).toHaveText('Copied!');await pause(850);}}},
  {id:'authorize',bars:3,title:'Authorization, within reach.',subtitle:'One shortcut. Clear status. No trip back to the top.',popup:[0,1.4],
    async run(s){await toggle(s,'authorizeInHeaderToggle',true);await pause(400);await click(s.page,s.page.locator('#swagger-header-authorize'));const dialog=s.page.locator('.dialog-ux');await dialog.locator('input').pressSequentially('orbit-demo-key',{delay:35});await click(s.page,dialog.getByRole('button',{name:/^(Authorize|Apply credentials)$/}));await pause(350);await click(s.page,dialog.getByRole('button',{name:'Close',exact:true}));await expect(s.page.locator('#swagger-header-authorize')).toHaveClass(/is-authorized/);await pause(1300);}},
  {id:'responses',bars:3,title:'Keep the result. Skip the noise.',subtitle:'Hide response docs without hiding live API responses.',popup:[0,1.7],
    async prepare(s){await openMission(s);await align(s,mission(s).locator('.opblock-summary'));},
    async run(s){await toggle(s,'hideResponsesToggle',true);const block=mission(s);await click(s.page,block.getByRole('button',{name:'Try it out',exact:true}));await click(s.page,block.getByRole('button',{name:'Execute',exact:true}));await expect(block.locator('.live-responses-table')).toContainText('Pixel');await align(s,block.locator('.live-responses-table'),155);await pause(2500);}},
  {id:'preview',bars:4,title:'Understand a schema, right here.',subtitle:'Fields, types and references. Without leaving the route.',popup:[0,1.4],
    async prepare(s){await openMission(s);await align(s,mission(s).locator('.opblock-summary'));},
    async run(s){await toggle(s,'schemaPreviewToggle',true);await click(s.page,s.page.getByRole('link',{name:'Mission schema',exact:true}));const card=s.page.locator('#swagger-schema-preview');await expect(card).toBeVisible();await pause(1400);await click(s.page,card.getByRole('button',{name:'CrewMember',exact:true}));await pause(1400);await click(s.page,card.getByRole('button',{name:'Back',exact:true}));await pause(1800);}},
  {id:'navigation',bars:3,title:'Go deeper. Get back faster.',subtitle:'Reveal the full model, then return to the top.',
    async prepare(s){await openMission(s);await align(s,mission(s).locator('.opblock-summary'));await click(s.page,s.page.getByRole('link',{name:'Mission schema',exact:true}));await expect(s.page.locator('#swagger-schema-preview')).toBeVisible();},
    async run(s){await click(s.page,s.page.getByRole('link',{name:'Open in Schemas',exact:true}));await expect(s.page.locator('section.models')).toHaveClass(/is-open/);const model=s.page.locator('article[data-json-schema-level="0"]').filter({has:s.page.getByRole('button',{name:'Mission',exact:true})});await expect(model.getByText('destination',{exact:true})).toBeVisible();await pause(2400);await click(s.page,s.page.locator('#swagger-scroll-top'));await expect.poll(()=>s.page.evaluate(()=>scrollY)).toBe(0);await pause(1100);}},
  {id:'sites',bars:3,title:'Your docs. Your domain.',subtitle:'Choose where Swagger Enhancer appears.',popup:[0,5.2],
    async prepare(s){await s.page.goto(origin+'/reference');await expect(s.page.locator('.opblock').first()).toBeVisible();},
    async run(s){await click(s.popup,s.popup.locator('#swagger-site-settings summary'));const input=s.popup.locator('#swagger-site-input');await click(s.popup,input);await input.pressSequentially(new URL(origin).host+'/reference',{delay:40});await input.press('Enter');await click(s.popup,s.popup.locator('#swagger-site-save'));await expect(s.popup.locator('#swagger-site-status')).toContainText('Saved');await s.reload();await expect(s.page.locator('#swagger-floating-menu')).toBeVisible();await expect(s.page.locator('html')).toHaveClass(/swagger-dark-theme/);await s.page.bringToFront();await pause(900);}}
];

(async()=>{
  const requested=process.env.DEMO_SCENES?.split(',');
  const metaFile=path.join(output,'recordings.json');
  let meta=fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile)):{};
  for(const chapter of chapters){
    if(requested&&!requested.includes(chapter.id))continue;
    console.log('Recording',chapter.id);
    const dir=path.join(output,'raw',chapter.id);fs.mkdirSync(dir,{recursive:true});
    const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:{width:1440,height:760},deviceScaleFactor:1,args:['--window-size=1920,1080','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
    let page,popup;
    try{
      const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
      await expect.poll(()=>worker.evaluate(()=>chrome.storage.sync.get('darkThemeEnabled'))).toEqual({darkThemeEnabled:false});
      await worker.evaluate(id=>chrome.storage.sync.set({darkThemeEnabled:id!=='theme',swaggerSearchEnabled:true,swaggerFavoritesEnabled:true,scrollTopEnabled:true,
        copyFullUrlEnabled:false,authorizeInHeaderEnabled:false,hideResponsesEnabled:false,hideSchemasEnabled:true,schemaPreviewEnabled:id==='navigation'}),chapter.id);
      await context.grantPermissions(['clipboard-read','clipboard-write']);
      await context.addInitScript(()=>{
        addEventListener('DOMContentLoaded',()=>{
          window.__filmMoves=[{time:Date.now()/1000,x:1100,y:650}];window.__filmClicks=[];
          addEventListener('pointermove',e=>window.__filmMoves.push({time:Date.now()/1000,x:e.clientX,y:e.clientY}));
          addEventListener('pointerdown',e=>window.__filmClicks.push({time:Date.now()/1000,x:e.clientX,y:e.clientY}));
        });
      });
      page=await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror',e=>console.error('PAGE:',e.message));
      await page.goto(origin+'/docs');
      await expect(page.locator('.swagger-fav-star').first()).toBeVisible();
      popup=await context.newPage();
      await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
      // Both tabs share a native window. Shrinking it to popup width clips the
      // background tab's video on macOS, although its screenshots look correct.
      const cdp=await context.newCDPSession(page);
      const {windowId}=await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1440,height:846}});
      await cdp.detach();
      await expect(popup.locator('#toggle')).toBeEnabled();await page.bringToFront();
      const s={page,popup,worker};
      if(chapter.prepare)await chapter.prepare(s);
      else await top(s);
      await retina(page);
      await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(1440);
      let mainStop=await capture(page,path.join(dir,'main'));
      const mainSegments=[];
      s.reload=async()=>{
        mainSegments.push(await mainStop());
        await page.reload();await retina(page);
        mainStop=await capture(page,path.join(dir,'main-reloaded'));
      };
      const popupStop=await capture(popup,path.join(dir,'popup'),150);
      await page.bringToFront();
      await pause(450);
      const start=Date.now();
      await chapter.run(s);
      await pause(Math.max(600,chapter.bars*bar*1000-(Date.now()-start)));
      const end=Date.now();
      mainSegments.push(await mainStop());
      const main=Object.fromEntries(['frames','moves','clicks'].map(key=>[key,mainSegments.flatMap(segment=>segment[key])]));
      const popupCapture=await popupStop();
      await page.screenshot({path:path.join(output,`${chapter.id}.png`),animations:'disabled'});
      const popupHeight=await popup.locator('#container').evaluate(el=>Math.ceil(el.getBoundingClientRect().height));
      await popup.screenshot({path:path.join(output,`${chapter.id}-popup.png`),animations:'disabled'});
      const item={...chapter,prepare:undefined,run:undefined,duration:chapter.bars*bar,start:start/1000,end:end/1000,
        popupWidth:640,popupHeight:Math.min(1520,popupHeight*2),main,popupCapture};
      await context.close();
      meta[chapter.id]=item;fs.writeFileSync(metaFile,JSON.stringify(meta,null,2));
      console.log('Saved',chapter.id,'raw seconds',((end-start)/1000).toFixed(2));
    }catch(error){
      if(page)await page.screenshot({path:path.join(output,'record-error.png')}).catch(()=>{});
      console.error('Recording failed:',chapter.id,error);await context.close().catch(()=>{});throw error;
    }
  }
})().catch(()=>process.exitCode=1);
