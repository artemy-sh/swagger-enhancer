const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const swagger = require('swagger-ui-dist').getAbsoluteFSPath();
const PORT = Number(process.env.DEMO_PORT || 4177);

const schemas = {
  Mission: {type:'object', description:'Your next small step into the unknown.', required:['id','name','status'], properties:{
    id:{type:'string',example:'msn_aurora'}, name:{type:'string',example:'Chase the northern lights'},
    status:{type:'string',enum:['ready','exploring','home']}, destination:{type:'string',example:'Europa'},
    captain:{$ref:'#/components/schemas/CrewMember'}, cargo:{type:'array',items:{$ref:'#/components/schemas/SpaceCat'}}
  }},
  CrewMember:{type:'object',description:'A good crew makes the galaxy feel smaller.',required:['callsign'],properties:{
    callsign:{type:'string',example:'Nova'}, role:{type:'string',enum:['pilot','engineer','snack officer']},
    experience:{type:'integer',format:'int32',example:42}, homePlanet:{type:'string',example:'Earth'}
  }},
  SpaceCat:{type:'object',description:'Every mission needs a little curiosity.',required:['name','mood'],properties:{
    name:{type:'string',example:'Pixel'}, mood:{type:'string',enum:['curious','sleepy','maximum purr']},
    favoriteSnack:{type:'string',example:'tuna treats'}, livesRemaining:{type:'integer',example:9},
    assignedTo:{$ref:'#/components/schemas/Mission'}
  }},
  LaunchRequest:{type:'object',required:['missionId'],properties:{missionId:{type:'string',example:'msn_aurora'},countdown:{type:'integer',default:10}}},
  Station:{type:'object',properties:{name:{type:'string',example:'Moonbeam'},oxygen:{type:'number',example:98.7},snackSupply:{type:'integer',example:120}}},
  ApiError:{type:'object',properties:{code:{type:'string',example:'SPACE_CAT_ASLEEP'},message:{type:'string',example:'Try again after a short nap.'}}}
};
const paths = {};
function operation(method,route,tag,summary,model='Mission',extra={}) {
  const parameters = [...route.matchAll(/\{([^}]+)\}/g)].map(([,name])=>({name,in:'path',required:true,schema:{type:'string'},example:name==='callsign'?'Nova':'orbit_01'}));
  (paths[route] ||= {})[method] = {tags:[tag],summary,operationId:method+route.replace(/\W/g,'_'),parameters,
    responses:{200:{description:'Mission accomplished',content:{'application/json':{schema:{$ref:`#/components/schemas/${model}`}}}},400:{description:'A small course correction is needed',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}}},...extra};
}
operation('get','/missions','Missions','Find your next adventure','Mission',{description:'Explore the [Mission schema](#/components/schemas/Mission) without losing your place.'});
operation('post','/launches','Missions','Launch something wonderful','Mission',{requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/LaunchRequest'}}}},security:[{flightKey:[]}]});
operation('put','/crew/{callsign}','Missions','Give your captain a fresh profile','CrewMember',{security:[{flightKey:[]}]});
operation('patch','/stations/{stationId}','Missions','Fine-tune your home in orbit','Station');
operation('delete','/debris/{debrisId}','Missions','Make a little space','ApiError');
operation('head','/health','Missions','All systems looking good','Station');
operation('options','/telemetry','Missions','Discover what your ship can do','Station');
const sectors=['Moonrise','Stardust','Blue horizon','Deep space','Solar garden','Andromeda','Nebula nine','Quiet orbit','Meteor trails','Aurora lab'];
for (let zone=0;zone<sectors.length;zone++) for(let i=0;i<22;i++) {
  const method=['get','post','put','patch','delete'][i%5];
  operation(method,`/sectors/${zone+1}/${['signals','probes','samples','beacons','logs'][i%5]}/${i+1}`,sectors[zone],['Read a signal from far away','Send a curious little probe','Update the expedition notes','Adjust the beacon frequency','Clear yesterday’s flight log'][i%5],'Station');
}
operation('get','/cats','Cosmic cats','Meet the crew behind the purr','SpaceCat',{description:'Meet Pixel. Inspect the [SpaceCat schema](#/components/schemas/SpaceCat).'});
operation('patch','/cats/{catId}/mood','Cosmic cats','Activate maximum purr','SpaceCat');
operation('post','/cats/{catId}/treats','Cosmic cats','Deliver a well-earned snack','SpaceCat');
const spec = {openapi:'3.1.0',info:{title:'Orbit Playground',version:'1.0',description:'A friendly API for missions, crew and cosmic cats.'},servers:[{url:`http://localhost:${PORT}`}],
  tags:[{name:'Missions',description:'Small endpoints. Big adventures.'},...sectors.map(name=>({name})),{name:'Cosmic cats',description:'The galaxy runs on curiosity.'}],
  paths,components:{securitySchemes:{flightKey:{type:'http',scheme:'bearer',bearerFormat:'Demo key',description:'Use any demo key. This playground never contacts a real service.'}},schemas}};
const mission={id:'msn_aurora',name:'Chase the northern lights',status:'exploring',destination:'Europa',captain:{callsign:'Nova',role:'pilot'},cargo:[{name:'Pixel',mood:'curious',favoriteSnack:'tuna treats',livesRemaining:9}]};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://localhost:${PORT}`);
  if(['/swagger-ui-bundle.js','/swagger-ui.css'].includes(url.pathname)){
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');
    fs.createReadStream(path.join(swagger,path.basename(url.pathname))).pipe(res);return;
  }
  if(url.pathname==='/openapi.json'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(spec));return;}
  if(url.pathname==='/init.js'){
    res.setHeader('Content-Type','application/javascript; charset=utf-8');
    res.end(`window.orbitUI=SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger',validatorUrl:null,docExpansion:'list',defaultModelsExpandDepth:1,deepLinking:true,displayRequestDuration:true});`);return;
  }
  if(url.pathname==='/docs'||url.pathname==='/reference'||url.pathname==='/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'");
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orbit Playground - Swagger UI</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/swagger-ui.css"><style>.swagger-ui .wrapper{max-width:1200px}.swagger-ui .info{margin:26px 0 16px}.swagger-ui .info .title{font-size:38px;letter-spacing:-1.2px}.swagger-ui .info p{font-size:15px}.swagger-ui .scheme-container{padding:16px 0;margin-bottom:22px}.swagger-ui .opblock{margin-bottom:11px}.swagger-ui .opblock-tag{font-size:23px}.swagger-ui .opblock-summary-description{font-size:13px}.swagger-ui .opblock-summary-path{font-size:15px}</style></head><body><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script></body></html>`);return;
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const result=url.pathname.startsWith('/cats')?{name:'Pixel',mood:'maximum purr',favoriteSnack:'tuna treats',livesRemaining:9}:url.pathname==='/health'?{status:'all systems looking good'}:mission;
  setTimeout(()=>res.end(JSON.stringify(result,null,2)),180);
});
if(require.main===module)server.listen(PORT,'127.0.0.1',()=>console.log(`Orbit Playground: http://localhost:${PORT}/docs`));
module.exports={server,spec};
