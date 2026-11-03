const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const output=process.env.DEMO_OUTPUT||'demo-output';fs.mkdirSync(output,{recursive:true});
  const source=fs.readFileSync(path.join(__dirname,'../js/mascot.js'),'utf8');
  const svg=source.match(/const artwork = `([\s\S]*?)`;/)[1].replace('stroke-width="2.8"','stroke-width="1.6"');
  const browser=await chromium.launch({channel:'chromium',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:500,height:500},deviceScaleFactor:2});
    for(const [name,color]of[['white','#f5f7fa'],['ink','#14181d']]){
      await page.setContent(`<style>body{margin:0;background:transparent}svg{width:360px;height:360px;color:${color}}</style>${svg}`);
      await page.locator('svg').screenshot({path:path.join(output,`cat-${name}.png`),omitBackground:true});
    }
    // Render the extension's real SVG/CSS hop at 30 fps, including the tail,
    // anticipation, squash and soft landing. No rigid image translation.
    const css=fs.readFileSync(path.join(__dirname,'../css/mascot.css'),'utf8');
    await page.setViewportSize({width:560,height:600});
    await page.setContent(`<style>body{margin:0;background:transparent}#stage{position:relative;width:560px;height:600px}#host{position:absolute;left:100px;top:180px;width:360px;height:360px;color:#f5f7fa}${css}.se-cat-art{stroke-width:1.6}</style><div id="stage"><span id="host"></span></div>`);
    await page.addScriptTag({content:source});
    await page.evaluate(()=>{
      SwaggerEnhancerMascot.mount(document.getElementById('host'));
      document.querySelector('.se-cat').classList.add('is-engaged');
      document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=0;});
    });
    fs.mkdirSync(path.join(output,'cat-hop'),{recursive:true});
    for(let frame=0;frame<=78;frame++){
      await page.evaluate(time=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=time;}),frame*1000/30);
      await page.locator('#stage').screenshot({path:path.join(output,'cat-hop',String(frame).padStart(3,'0')+'.png'),omitBackground:true});
    }
  }finally{await browser.close()}
})();
