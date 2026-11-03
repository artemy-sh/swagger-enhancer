/** Timestamped PNG frames, without the lossy WebM recording stage. */
const fs=require('node:fs/promises');
const path=require('node:path');
async function capture(page,dir,interval=10){
  await fs.mkdir(dir,{recursive:true});
  {
    // Navigation can halve Chromium's screencast surface on macOS. Screenshot
    // capture keeps its actual Retina pixels across document reloads.
    const screenshotSession=await page.context().newCDPSession(page);
    await page.bringToFront();
    const frames=[];let active=true,ready;
    const first=new Promise(resolve=>ready=resolve);
    const loop=(async()=>{
      while(active){
        const time=Date.now()/1000;
        const file=path.join(dir,String(frames.length).padStart(5,'0')+'.png');
        const {cssVisualViewport:viewport}=await screenshotSession.send('Page.getLayoutMetrics');
        const result=await screenshotSession.send('Page.captureScreenshot',{format:'png',optimizeForSpeed:true,fromSurface:true,captureBeyondViewport:false,clip:{x:viewport.pageX,y:viewport.pageY,width:1440,height:760,scale:2}});
        const data=Buffer.from(result.data,'base64');await fs.writeFile(file,data);
        frames.push({time,file,width:data.readUInt32BE(16),height:data.readUInt32BE(20)});ready();
        if(active)await new Promise(resolve=>setTimeout(resolve,interval));
      }
    })();
    await Promise.race([first,loop]);
    return async()=>{active=false;await loop;await screenshotSession.detach();return {frames,...await page.evaluate(()=>({moves:window.__filmMoves||[],clicks:window.__filmClicks||[]}))};};
  }
}
module.exports={capture};
