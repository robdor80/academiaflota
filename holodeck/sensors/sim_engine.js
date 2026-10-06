const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const now=()=>new Date().toLocaleTimeString("es-ES",{hour12:false});
const labels={
  low:"BAJA",medium:"MEDIA",high:"ALTA",severe:"SEVERA",
  standard:"ESTÁNDAR",high_resolution:"ALTA",general:"GENERAL"
};
export function createSimulation(scenario){
  const s=clone(scenario);
  const contacts=s.contacts.map(c=>({...c,history:[],tracked:false,trackingMode:null,trackingPriority:"normal",lastObserved:null}));
  const capacity=s.trackingCapacity||8;
  const state={
    scenarioId:s.id,scenarioTitle:s.title,serial:1,time:0,
    basePower:72,power:72,powerBudget:s.powerBudget||12,powerRequest:null,
    arrays:s.arrays,activeArray:(s.arrays.find(a=>a.available)||s.arrays[0])?.id||null,
    interference:{...s.interference,originalPenalty:s.interference.penalty,compensation:"none",previous:null},
    contacts,selectedContactId:contacts.find(c=>c.known)?.id||contacts[0]?.id||null,
    tracking:{capacity,assignments:[]},
    operations:[],results:[],savedReadings:[],comparisons:[],
    transfers:[],engineeringRequests:[],diagnostics:[],
    config:{
      sensitivity:"standard",defaultResolution:"standard",bandFrequency:"broad",
      updateRate:"standard",defaultFilters:["all"],defaultPriority:"none",
      operationPower:70,profile:"standard"
    },
    profiles:{
      standard:{origin:"Starfleet",readOnly:true,settings:{sensitivity:"standard",defaultResolution:"standard",bandFrequency:"broad",updateRate:"standard",defaultFilters:["all"],defaultPriority:"none"}},
      long_range:{origin:"Starfleet",readOnly:true,settings:{sensitivity:"high",defaultResolution:"standard",bandFrequency:"subspace",updateRate:"slow",defaultFilters:["subspace","warp"],defaultPriority:"subspace"}},
      search_rescue:{origin:"Starfleet",readOnly:true,settings:{sensitivity:"high",defaultResolution:"standard",bandFrequency:"broad",updateRate:"standard",defaultFilters:["biological","transponder","thermal"],defaultPriority:"biological"}},
      low_noise:{origin:"Starfleet",readOnly:true,settings:{sensitivity:"standard",defaultResolution:"general",bandFrequency:"em",updateRate:"slow",defaultFilters:["em"],defaultPriority:"none"}}
    }
  };
  for(const id of s.initialTracking||[]) startTracking(state,id,"normal","normal");
  return state;
}
export function knownContacts(state){return state.contacts.filter(c=>c.known)}
export function getContact(state,id=state.selectedContactId){return state.contacts.find(c=>c.id===id)||null}
export function getArray(state,id=state.activeArray){return state.arrays.find(a=>a.id===id)||null}
export function trackingCost(mode="normal",priority="normal"){return mode==="signature"?2:priority==="priority"?2:1}
export function trackingUsed(state){return state.tracking.assignments.reduce((n,a)=>n+trackingCost(a.mode,a.priority),0)}
export function effectivePenalty(state){
  let p=state.interference.penalty;
  const a=getArray(state);
  if(a){p+=Math.max(0,100-a.integrity)*.25+Math.max(0,100-a.calibration)*.15}
  if(state.interference.compensation==="automatic")p*=.65;
  if(state.interference.compensation==="manual")p*=.48;
  if(state.config.bandFrequency!=="broad"&&state.config.bandFrequency!==state.interference.band)p*=.72;
  return Math.round(p);
}
function qualityScore(state,cfg={}){
  const a=getArray(state);
  const res={general:0,standard:8,high:18}[cfg.resolution||state.config.defaultResolution]||0;
  const dur={quick:-8,standard:5,extended:17,custom:12}[cfg.duration||"standard"]||0;
  const mode=cfg.mode==="active"?10:0;
  const sensitivity={low:-10,standard:0,high:14,maximum:22}[cfg.sensitivity||state.config.sensitivity]||0;
  const power=(state.power-60)*.45;
  const array=((a?.integrity||0)+(a?.calibration||0)-150)*.18;
  const penalty=effectivePenalty(state);
  return clamp(48+res+dur+mode+sensitivity+power+array-penalty,5,99);
}
function signatureMatch(contact,filters=[]){
  if(!filters.length||filters.includes("all"))return 1;
  const sig=new Set(contact.signatures||[]);
  const mapped=filters.map(f=>f==="biological"?"lifeform":f);
  return mapped.some(f=>sig.has(f)||contact.kind===f)?1:.35;
}
function revealContact(state,c,confidence,source){
  c.known=true;c.status=c.status==="lost"?"unidentified":c.status;c.confidence=clamp(Math.max(c.confidence,confidence));
  c.lastObserved=now();c.history.unshift({time:c.lastObserved,source,confidence:c.confidence});
  if(c.confidence>=82&&c.classification!=="No identificado"&&c.classification!=="Desconocido")c.status="identified";
}
export function createOperation(state,type,config){
  const id=(type.startsWith("search")?"SRC":"SCN")+"-"+String(state.serial++).padStart(4,"0");
  const op={id,type,config:clone(config),progress:0,state:"running",createdAt:now(),resourceUse:{power:state.power,array:state.activeArray}};
  state.operations.push(op);return op;
}
export function operationDuration(config={}){
  return ({quick:1600,standard:2600,extended:4200,custom:3400}[config.duration]||2400);
}
export function resolveScan(state,op){
  const cfg=op.config,q=qualityScore(state,cfg);
  const filters=Array.isArray(cfg.filters)?cfg.filters:[cfg.filters||"all"];
  const contacts=[];
  const focused=cfg.scanType==="focused";
  for(const c of state.contacts){
    if(focused&&cfg.contactId&&c.id!==cfg.contactId)continue;
    let score=q*signatureMatch(c,filters)+(c.signal||0)*.22;
    if(cfg.targetValue==="sector_014")score-=55;
    if(cfg.targetValue==="surrounding"&&c.distanceKm>35000)score-=30;
    if(cfg.priority&&cfg.priority!=="none"&&(c.signatures||[]).includes(cfg.priority))score+=10;
    if(cfg.scanType==="short_range"&&c.distanceKm>35000)score-=28;
    if(cfg.scanType==="long_range"&&c.distanceKm<10000)score-=2;
    if(!c.known&&score<55)continue;
    if(c.status==="lost"&&score<60)continue;
    const conf=clamp(Math.round((c.confidence*.55)+(score*.45)));
    revealContact(state,c,conf,"scan:"+op.id);
    if(focused&&c.id===cfg.contactId)c.confidence=clamp(c.confidence+(cfg.resolution==="high"?18:10)+(state.power>=82?6:0));
    contacts.push({id:c.id,confidence:c.confidence,status:c.status});
  }
  const result={
    id:op.id,type:"scan",subtype:cfg.scanType,target:cfg.targetLabel||cfg.targetValue||cfg.contactId||"Área",
    time:now(),configuration:clone(cfg),quality:q,observations:contacts,
    summary:contacts.length?contacts.map(x=>x.id+" "+x.confidence+"%").join(" · "):"Sin contactos concluyentes",
    emissionExposure:cfg.mode==="active"?"EMISIÓN ACTIVA DETECTABLE":"PASIVO / SIN EMISIÓN",
    provenance:"Sensores / "+state.activeArray
  };
  state.results.unshift(result);op.progress=100;op.state="completed";op.completedAt=result.time;
  return result;
}
const searchKinds={
  starship:["starship"],shuttle:["shuttle"],probe_beacon:["probe_beacon"],lifeform:["lifeform"],
  artificial_object:["artificial_object","probe_beacon"],energy_source:["energy_source","starship","shuttle"],
  warp_signature:["starship","shuttle","unknown"],subspace_emission:["starship","unknown"],
  signal_transponder:["starship","shuttle","probe_beacon"],radiation_particle:["radiation_source","unknown"],
  custom_signature:["starship","shuttle","probe_beacon","artificial_object","unknown","lifeform"]
};
export function resolveSearch(state,config){
  const id="SRC-"+String(state.serial++).padStart(4,"0"),q=qualityScore(state,config);
  const candidates=[];
  const accepted=new Set(searchKinds[config.searchType]||[]);
  for(const c of state.contacts){
    let compatible=accepted.has(c.kind);
    if(config.searchType==="warp_signature")compatible=(c.signatures||[]).some(x=>x.includes("warp"));
    if(config.searchType==="subspace_emission")compatible=(c.signatures||[]).includes("subspace");
    if(config.searchType==="signal_transponder")compatible=(c.signatures||[]).includes("transponder");
    if(config.searchType==="energy_source")compatible=(c.signatures||[]).some(x=>["energy","em","thermal"].includes(x));
    if(config.searchType==="custom_signature"&&config.criteria){
      const needle=config.criteria.toLowerCase();
      compatible=c.signatures.some(x=>x.includes(needle))||c.classification.toLowerCase().includes(needle);
    }
    if(!compatible)continue;
    let match=q*.72+(c.signal||0)*.28;
    if(config.area==="local"&&c.distanceKm>30000)match-=35;
    if(config.area==="sector_014")match-=55;
    if(config.sensitivity==="high")match+=8;
    if(config.sensitivity==="maximum")match+=12;
    if(match<42)continue;
    const conf=clamp(Math.round(match));
    revealContact(state,c,Math.max(c.confidence,conf*.72),"search:"+id);
    candidates.push({id:c.id,match:conf,classification:c.classification});
  }
  if((config.sensitivity==="maximum"||config.sensitivity==="high")&&effectivePenalty(state)>25){
    candidates.push({id:"TRAZA-"+String(state.serial++).padStart(3,"0"),match:34,classification:"Falso positivo posible",falsePositive:true});
  }
  const result={id,type:"search",subtype:config.searchType,target:config.area||"Área",time:now(),configuration:clone(config),quality:q,observations:candidates,summary:candidates.length?candidates.map(c=>c.id+" "+c.match+"%").join(" · "):"Sin candidatos compatibles",provenance:"Sensores / "+state.activeArray};
  state.results.unshift(result);return result;
}
export function startTracking(state,contactId,mode="normal",priority="normal",signature=null){
  const c=getContact(state,contactId);if(!c)return {ok:false,reason:"Contacto inexistente"};
  const existing=state.tracking.assignments.find(a=>a.contactId===contactId);
  const need=trackingCost(mode,priority)-(existing?trackingCost(existing.mode,existing.priority):0);
  if(trackingUsed(state)+need>state.tracking.capacity)return {ok:false,reason:"Capacidad de seguimiento insuficiente"};
  if(existing){existing.mode=mode;existing.priority=priority;existing.signature=signature||existing.signature;existing.updatedAt=now()}
  else state.tracking.assignments.push({contactId,mode,priority,signature,quality:clamp(c.confidence+10),updatedAt:now()});
  c.tracked=true;c.trackingMode=mode;c.trackingPriority=priority;return {ok:true};
}
export function stopTracking(state,contactId){
  state.tracking.assignments=state.tracking.assignments.filter(a=>a.contactId!==contactId);
  const c=getContact(state,contactId);if(c){c.tracked=false;c.trackingMode=null}
  return {ok:true};
}
export function updateTracking(state,contactId,kind,options={}){
  const c=getContact(state,contactId);if(!c)return {ok:false,reason:"Contacto inexistente"};
  const a=state.tracking.assignments.find(x=>x.contactId===contactId);
  if(!a&&kind!=="reacquire")return {ok:false,reason:"El contacto no está en seguimiento"};
  if(kind==="position"){c.confidence=clamp(c.confidence+5);a.quality=clamp(a.quality+4);a.updatedAt=now();return {ok:true,value:"Posición actualizada · confianza "+c.confidence+"%"}}
  if(kind==="course")return {ok:true,value:c.vector,confidence:clamp(c.confidence-4)};
  if(kind==="velocity")return {ok:true,value:c.velocity,confidence:clamp(c.confidence-3)};
  if(kind==="trajectory"){const horizon=options.horizon||"5 min";return {ok:true,value:"Proyección "+c.vector+" · "+horizon,confidence:clamp(c.confidence-(horizon==="30 min"?28:horizon==="15 min"?18:9))}}
  if(kind==="reacquire"){
    if(c.status!=="lost")return {ok:false,reason:"El contacto no está perdido"};
    const score=qualityScore(state,{resolution:"standard",duration:"extended",sensitivity:"high"});
    if(score<42)return {ok:false,reason:"Señal no recuperada"};
    c.status="unidentified";c.signal=Math.max(18,c.signal);c.confidence=clamp(Math.max(38,score*.7));c.known=true;
    startTracking(state,c.id,"normal","priority");return {ok:true,value:"Contacto recuperado · "+c.confidence+"%"};
  }
  return {ok:false,reason:"Operación de seguimiento desconocida"};
}
export function readout(state,contactId,readoutId){
  const c=getContact(state,contactId);if(!c)return null;
  const map={
    signal_strength:(c.signal||0)+" / 100",
    signature_type:(c.signatures||[]).join(" · ")||"No resuelta",
    band_frequency:c.band,energy_signature:c.energy,subspace_signature:c.subspace,
    approx_mass:c.mass,approx_dimensions:c.dimensions,vector_velocity:c.vector+" · "+c.velocity,
    detectable_lifeforms:c.lifeforms,known_pattern_match:(c.patternMatch??0)+" %"
  };
  return {value:map[readoutId]??"Sin dato",uncertainty:c.confidence>=80?"Baja":c.confidence>=55?"Media":"Alta",confidence:c.confidence,timestamp:c.lastObserved||"Observación inicial",provenance:"Sensores / "+state.activeArray,history:c.history};
}
export function applyInterference(state,action,payload={}){
  const i=state.interference;
  if(action==="automatic"){i.previous=clone(i);i.compensation="automatic";i.penalty=Math.max(3,Math.round(i.originalPenalty*.65));return {ok:true,message:"Compensación automática aplicada"}}
  if(action==="manual"){i.previous=clone(i);i.compensation="manual";i.penalty=Math.max(2,Math.round(i.originalPenalty*.48));if(payload.band)state.config.bandFrequency=payload.band;return {ok:true,message:"Compensación manual aplicada"}}
  if(action==="restore"&&i.previous){const prev=i.previous;state.interference={...prev,previous:null};return {ok:true,message:"Compensación anterior restaurada"}}
  if(action==="band"){state.config.bandFrequency=payload.band||"em";i.penalty=Math.max(2,Math.round(i.penalty*.75));return {ok:true,message:"Banda cambiada"}}
  if(action==="power"){state.config.operationPower=clamp(Number(payload.value)||80,10,100);return {ok:true,message:"Potencia de operación ajustada dentro de la asignación"}}
  if(action==="reduce_resolution"){state.config.defaultResolution=payload.resolution||"general";i.penalty=Math.max(2,i.penalty-7);return {ok:true,message:"Resolución reducida para estabilizar señal"}}
  if(action==="extend"){i.penalty=Math.max(2,i.penalty-9);return {ok:true,message:"Integración prolongada; mejora de señal esperada"}}
  if(action==="recover"){const c=getContact(state,payload.contactId);if(c&&c.status==="lost")return updateTracking(state,c.id,"reacquire");i.penalty=Math.max(2,i.penalty-5);return {ok:true,message:"Recuperación de señal completada"}}
  return {ok:false,reason:"Acción de interferencia desconocida"};
}
export function applyConfig(state,key,value){
  if(key==="sensor_array"){
    const a=getArray(state,value);if(!a?.available)return {ok:false,reason:"Matriz no disponible"};state.activeArray=value;return {ok:true}
  }
  if(key==="sensor_power"){state.config.operationPower=clamp(Number(value)||state.config.operationPower,10,100);return {ok:true}}
  state.config[key]=clone(value);return {ok:true};
}
export function restoreStandard(state){
  Object.assign(state.config,{sensitivity:"standard",defaultResolution:"standard",bandFrequency:"broad",updateRate:"standard",defaultFilters:["all"],defaultPriority:"none",operationPower:70,profile:"standard"});
}
export function loadProfile(state,id){
  const p=state.profiles[id];if(!p)return {ok:false,reason:"Perfil inexistente"};
  Object.assign(state.config,clone(p.settings),{profile:id});return {ok:true};
}
export function saveProfile(state,id,name){
  if(state.profiles[id]?.readOnly)return {ok:false,reason:"No se puede sobrescribir un perfil Starfleet protegido"};
  state.profiles[id]={origin:"Operador",readOnly:false,name,settings:clone({...state.config,profile:undefined})};return {ok:true};
}
export function deleteProfile(state,id){if(state.profiles[id]?.readOnly)return {ok:false,reason:"Perfil de Flota protegido"};delete state.profiles[id];return {ok:true}}
export function runDiagnostic(state,scope="all"){
  const issues=[];
  for(const a of state.arrays){
    if(scope!=="all"&&scope!==a.id)continue;
    if(a.integrity<75)issues.push({code:a.error||"S-"+Math.round(300-a.integrity),component:a.id,severity:a.integrity<50?"CRÍTICA":"ALTA",effect:"Alcance y resolución degradados"});
    if(a.calibration<80)issues.push({code:"CAL-"+a.id,component:a.id,severity:"MEDIA",effect:"Desviación de calibración"});
  }
  const report={id:"DGN-"+String(state.serial++).padStart(4,"0"),time:now(),scope,issues,status:issues.length?"DEGRADADO":"NOMINAL"};
  state.diagnostics.unshift(report);return report;
}
export function calibrateArray(state,id){
  const a=getArray(state,id);if(!a)return {ok:false,reason:"Matriz inexistente"};
  if(a.integrity<45)return {ok:false,reason:"Daño físico excesivo; requiere Ingeniería"};
  a.calibration=Math.min(100,a.calibration+28);return {ok:true,message:"Calibración completada · "+a.calibration+"%"};
}
export function requestEngineering(state,payload){
  const req={id:"ENG-"+String(state.serial++).padStart(4,"0"),time:now(),state:"PENDIENTE",...clone(payload)};
  state.engineeringRequests.unshift(req);return req;
}
export function makePowerResponse(state,request){
  const wanted=Number(request.requested)||10;
  let factor=request.priority==="Urgente"?.9:request.priority==="Operativa"?.72:.55;
  const granted=Math.max(0,Math.min(wanted,state.powerBudget,Math.round(wanted*factor)));
  state.powerBudget=Math.max(0,state.powerBudget-granted);
  state.power=clamp(state.power+granted);
  return {state:granted===0?"DENEGADA":granted<wanted?"APROBADA PARCIAL":"APROBADA",requested:wanted,granted};
}
export function transferData(state,target,contactId,details={}){
  const c=getContact(state,contactId);
  const tx={id:"TX-"+String(state.serial++).padStart(4,"0"),time:now(),target,contactId,state:"ENVIADO",confidence:c?.confidence??null,details:clone(details)};
  state.transfers.unshift(tx);return tx;
}
export function saveReading(state,resultId,label){
  const r=state.results.find(x=>x.id===resultId);if(!r)return {ok:false,reason:"Resultado inexistente"};
  const saved={...clone(r),savedId:"SAV-"+String(state.serial++).padStart(4,"0"),label:label||r.id};
  state.savedReadings.unshift(saved);return {ok:true,saved};
}
export function compareReadings(state,aId,bId){
  const all=[...state.results,...state.savedReadings];
  const a=all.find(x=>x.id===aId||x.savedId===aId),b=all.find(x=>x.id===bId||x.savedId===bId);
  if(!a||!b)return {ok:false,reason:"Seleccione dos lecturas válidas"};
  const ca=a.observations?.length||0,cb=b.observations?.length||0;
  const cmp={id:"CMP-"+String(state.serial++).padStart(4,"0"),time:now(),a:aId,b:bId,summary:"Contactos "+ca+" → "+cb+" · calidad "+(a.quality??"—")+" → "+(b.quality??"—")};
  state.comparisons.unshift(cmp);return {ok:true,comparison:cmp};
}
export function severityLabel(v){return labels[v]||String(v||"—").toUpperCase()}
