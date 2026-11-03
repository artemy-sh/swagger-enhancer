const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
function setup(t){
 const w=new JSDOM('<a id="link" href="#/components/schemas/Pet">Pet</a><div class="swagger-ui"><section class="models"><button class="models-control">Schemas</button></section></div>',{url:'https://example.test/docs',runScripts:'outside-only',pretendToBeVisual:true}).window;
 const d=w.document;
 const event=()=>({addListener(){},removeListener(){}});
 w.chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:event()},storage:{onChanged:event()}};
 for(const file of ['utils','schema_navigation','schema_preview'])w.eval(fs.readFileSync(path.resolve(__dirname,'../js/'+file+'.js'),'utf8'));
 const schemas={Pet:{type:'object',description:'<img src=x onerror=alert(1)>',required:['id'],properties:{id:{type:'integer'},owner:{$ref:'#/components/schemas/Owner'}}},Owner:{type:'object',properties:{name:{type:'string'}}},Empty:{type:'object'}};
 const controller=w.SwaggerEnhancerSchemaNavigation.attach({specSelectors:{isOAS31:()=>true,selectSchemas:()=>schemas}});
 const feature=new w.SchemaPreviewFeature();feature.setEnabled(true);
 const link=d.querySelector('#link');link.getBoundingClientRect=()=>({top:50,bottom:70,left:20,right:60,width:40,height:20});
 const click=(options={})=>{
   const event=new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,...options});
   link.dispatchEvent(event);return event;
 };
 t.after(()=>{feature.destroy();controller.destroy();w.close();});
 return {w,d,link,feature,click};
}
test('preview shows schema properties without navigation or HTML execution and closes on Escape',t=>{
 const {w,d,link,click}=setup(t);
 const event=click();assert.equal(event.defaultPrevented,true);
 const panel=d.querySelector('#swagger-schema-preview');
 assert.equal(panel.getAttribute('role'),'dialog');
 assert.equal(panel.querySelector('h3').textContent,'Pet');
 assert.match(panel.textContent,/required/);
 assert.match(panel.textContent,/<img src=x/);
 assert.equal(panel.querySelector('img'),null);
 assert.equal(w.location.hash,'');
 assert.equal(d.querySelector('section.models').classList.contains('is-open'),false);
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(d.querySelector('#swagger-schema-preview'),null);
 assert.equal(d.activeElement,link);
});
test('references can be inspected and navigated back without expanding Schemas',t=>{
 const {d,click}=setup(t);click();
 d.querySelector('.swagger-schema-preview-reference').click();
 assert.equal(d.querySelector('#swagger-schema-preview h3').textContent,'Owner');
 assert.match(d.querySelector('#swagger-schema-preview').textContent,/name/);
 d.querySelector('.swagger-schema-preview-back').click();
 assert.equal(d.querySelector('#swagger-schema-preview h3').textContent,'Pet');
 assert.equal(d.activeElement,d.querySelector('.swagger-schema-preview-close'));
 assert.equal(d.querySelector('section.models').classList.contains('is-open'),false);
});
test('empty schemas are described honestly and disabling the feature restores native links',t=>{
 const {d,link,feature,click}=setup(t);link.href='#/components/schemas/Empty';click();
 assert.match(d.querySelector('#swagger-schema-preview').textContent,/No properties are defined/);
 feature.onSpecChanged();assert.equal(d.querySelector('#swagger-schema-preview'),null);
 assert.equal(feature.current,null);click();assert.ok(d.querySelector('#swagger-schema-preview'));
 feature.setEnabled(false);assert.equal(d.querySelector('#swagger-schema-preview'),null);
 const event=click();assert.equal(event.defaultPrevented,false);
 event.preventDefault();
});
test('modifiers and unsupported targets keep native behavior',t=>{
 const {d,link,click}=setup(t);
 for(const options of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}]){
  const event=click(options);assert.equal(event.defaultPrevented,false);event.preventDefault();
 }
 link.target='_blank';const external=click({ctrlKey:true});assert.equal(external.defaultPrevented,false);external.preventDefault();
 link.target='';link.href='https://other.test/docs#/components/schemas/Pet';const other=click();assert.equal(other.defaultPrevented,false);other.preventDefault();
 assert.equal(d.querySelector('#swagger-schema-preview'),null);
});
test('the full-schema action reveals the model without changing the documentation URL',t=>{
 const {w,d,click}=setup(t);click();
 let reveal;
 d.addEventListener('swagger-enhancer:schema-reveal',event=>{reveal=JSON.parse(event.detail);});
 d.querySelector('.swagger-schema-preview-footer a').click();
 assert.match(reveal.href,/#\/components\/schemas\/Pet$/);
 assert.equal(d.querySelector('#swagger-schema-preview'),null);
 assert.equal(w.location.hash,'');
});

test('ordinary clicks on local schema links use the preview despite Swagger Markdown target blank',t=>{
 const {d,link,click}=setup(t);link.target='_blank';
 assert.equal(click().defaultPrevented,true);
 assert.equal(d.querySelector('#swagger-schema-preview h3').textContent,'Pet');
});
