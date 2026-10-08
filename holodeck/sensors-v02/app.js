import {initTeacherMode,emitTeacherEvent} from "./teacher_mode.js";
import {
  createSimulation,knownContacts,getContact,getArray,trackingUsed,effectivePenalty,
  createOperation,resolveScan,resolveSearch,startTracking,stopTracking,updateTracking,
  readout,applyInterference,applyConfig,restoreStandard,loadProfile,saveProfile,deleteProfile,runDiagnostic,calibrateArray,
  requestEngineering,makePowerResponse,transferData,saveReading,compareReadings,passiveSurveillanceCycle,contactSpatialSolution
} from "../sensors/sim_engine.js";
import {COMPUTER_PROFILES,validateCommandPlan,planPreview} from "./computer_contract.js";
import {interpretCommand,aiEndpoint,localInterpret} from "./ai_gateway.js";
import {createVoiceController} from "./voice_input.js";
import {composeComputerResponse} from "./response_composer.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const state={
  scenarios:null,sim:null,profileId:"picard",selectedContactId:null,
  conversation:[],logs:[],lastDetails:[],watchers:[],busy:false,
  attention:null,lastPlan:null,routingMode:"auto",
  aiRuntime:{provider:null,modelUsed:null,escalated:false},
  lastObservationBatch:null,
  routineWatch:{
    enabled:true,
    mode:"Pasiva continua",
    status:"Sin novedades",
    lastCheck:null,
    checks:0,
    alertCount:0,
    reportTo:"Oficial al mando del puente",
    baseline:null,
    newUnknownIds:[],
    lastCycle:null
  },
  worldTestTimers:[]
};

function log(msg){
  const t=new Date().toLocaleTimeString("es-ES",{hour12:false});
  state.logs.unshift(t+"  "+msg);renderLog();
}
function teacherLog(msg){log("INSTRUCTOR · "+msg)}
function addMessage(role,text,meta=""){
  state.conversation.push({role,text,meta,time:new Date().toLocaleTimeString("es-ES",{hour12:false})});
  if(state.conversation.length>80)state.conversation.shift();
  renderConversation();
}
function profile(){return COMPUTER_PROFILES[state.profileId]||COMPUTER_PROFILES.picard}
function scenarioById(id){return state.scenarios.scenarios.find(x=>x.id===id)||state.scenarios.scenarios[0]}
function selectedContact(){return getContact(state.sim,state.selectedContactId||state.sim?.selectedContactId)}
function externalShipState(){
  try{
    const p=window.STARSHIP_STATE_PROVIDER;
    if(!p)return null;
    if(typeof p==="function")return p();
    if(typeof p.getState==="function")return p.getState();
    return p.state||null;
  }catch{return null}
}
function buildContext(){
  const sim=state.sim,c=selectedContact();
  return {
    computerProfile:state.profileId,
    selection:{contactId:c?.id||null},
    sensors:{
      scenarioId:sim.scenarioId,sector:sim.sector,power:sim.power,powerBudget:sim.powerBudget,
      activeArray:sim.activeArray,interferencePenalty:effectivePenalty(sim),
      tracking:{used:trackingUsed(sim),capacity:sim.tracking.capacity,assignments:sim.tracking.assignments.map(x=>({...x}))},
      contacts:knownContacts(sim).map(x=>({
        id:x.id,classification:x.classification,status:x.status,confidence:x.confidence,
        signatures:x.signatures,distanceKm:x.distanceKm,
        bearingDeg:contactSpatialSolution(x).bearingDeg,elevationDeg:contactSpatialSolution(x).elevationDeg,
        courseBearingDeg:contactSpatialSolution(x).courseBearingDeg,courseElevationDeg:contactSpatialSolution(x).courseElevationDeg,
        velocity:x.velocity,relativeMotion:contactSpatialSolution(x).relativeMotion,
        closestApproachKm:contactSpatialSolution(x).closestApproachKm,tcpaMinutes:contactSpatialSolution(x).tcpaMinutes,
        tracked:x.tracked,trackingMode:x.trackingMode,trackingPriority:x.trackingPriority,marked:!!x.marked
      })),
      recentResults:sim.results.slice(0,5).map(r=>({id:r.id,type:r.type,subtype:r.subtype,target:r.target,summary:r.summary,time:r.time}))
    },
    shipState:externalShipState()
  };
}
function resetScenario(source="manual",scenarioId=null){
  const sc=scenarioById(scenarioId||state.sim?.scenarioId||state.scenarios.scenarios[0].id);
  state.sim=createSimulation(sc);
  state.selectedContactId=state.sim.selectedContactId;
  state.watchers=[];state.attention=null;state.lastDetails=[];state.lastPlan=null;state.lastObservationBatch=null;
  for(const id of state.worldTestTimers){clearTimeout(id);clearInterval(id)}
  state.worldTestTimers=[];
  setWorldTestIdle();
  state.routineWatch.status="Sin novedades";state.routineWatch.alertCount=0;state.routineWatch.baseline=null;state.routineWatch.newUnknownIds=[];state.routineWatch.lastCycle=null;
  if($("#scenario-select"))$("#scenario-select").value=sc.id;
  addMessage("system","Escenario reiniciado · "+sc.title);
  log("RESET scenario · "+source+" · "+sc.id);
  render();
  emitTeacherEvent("SCENARIO_RESET",{source,scenarioId:sc.id});
}
function renderComputer(){
  const p=profile();
  $("#computer-name").textContent=p.name;
  $("#computer-description").textContent=p.description;
  $("#computer-caps").innerHTML=p.caps.map(x=>'<span class="cap">'+esc(x)+'</span>').join("");
  if(state.aiRuntime.provider==="gemini"){
    $("#ai-badge").textContent=state.aiRuntime.escalated
      ?"GEMINI 3.8 · ESCALADO"
      :"GEMINI · "+(state.aiRuntime.modelUsed||"ACTIVO");
  }else if(state.aiRuntime.provider==="fallback"){
    $("#ai-badge").textContent="GEMINI → FALLBACK";
  }else if(!aiEndpoint()){
    $("#ai-badge").textContent="INTÉRPRETE LOCAL";
  }else{
    $("#ai-badge").textContent=state.routingMode==="flash38"?"GEMINI 3.8":state.routingMode==="lite"?"GEMINI 3.5 LITE":"GEMINI AUTO";
  }
}
function renderContacts(){
  const list=knownContacts(state.sim);
  const unknownAttention=new Set(state.routineWatch.newUnknownIds||[]);
  $("#contacts-list").innerHTML=list.map(c=>{
    const needsAttention=unknownAttention.has(c.id);
    const isPriority=c.operationalPriority==="high";
    const isLost=c.status==="lost";
    const cls=["contact-card",c.id===state.selectedContactId?"active":"",needsAttention?"routine-alert":"",isPriority?"priority-contact":"",isLost?"lost-contact":""].filter(Boolean).join(" ");
    const identity=c.transponderRecognized&&c.transponderLabel?c.transponderLabel:c.classification;
    const secondary=c.transponderRecognized&&c.transponderLabel&&c.classification&&c.classification!==identity
      ?'<span class="contact-classification">'+esc(c.classification)+'</span>'
      :'';
    return '<div class="'+cls+'" data-contact="'+esc(c.id)+'">'+
      '<div class="contact-top"><strong>'+esc(c.id)+'</strong><strong>'+(isLost?"ÚLT. ":"")+Math.round(c.confidence)+'%</strong></div>'+
      '<span>'+esc(identity)+'</span>'+secondary+'<div class="contact-meta">'+
      (isLost?'<span class="mini-tag lost-tag">'+(c.initiallyLost?"PÉRDIDA PREVIA":"CONTACTO PERDIDO")+'</span>':'')+
      (needsAttention?'<span class="mini-tag alert-tag">NUEVO · DESCONOCIDO</span>':'')+
      (isPriority?'<span class="mini-tag priority-tag">PRIORITARIO</span>':'')+
      (c.affiliation?'<span class="mini-tag">'+esc(c.affiliation)+'</span>':'')+
      (c.transponderRecognized?'<span class="mini-tag">transpondedor reconocido</span>':'')+
      (!c.transponderRecognized&&(c.signatures||[]).includes("transponder")?'<span class="mini-tag">transpondedor detectado</span>':'')+
      (c.tracked?'<span class="mini-tag">seguimiento '+esc(c.trackingPriority)+'</span>':'')+
      (c.marked?'<span class="mini-tag">marcado</span>':'')+
      (c.signatures||[]).slice(0,2).map(x=>'<span class="mini-tag">'+esc(x)+'</span>').join("")+
      '</div></div>';
  }).join("");
  document.querySelectorAll("[data-contact]").forEach(el=>el.onclick=()=>{
    state.selectedContactId=el.dataset.contact;state.sim.selectedContactId=el.dataset.contact;
    state.routineWatch.newUnknownIds=(state.routineWatch.newUnknownIds||[]).filter(id=>id!==el.dataset.contact);
    log("SELECT "+el.dataset.contact);emitTeacherEvent("SELECT_CONTACT",{contactId:el.dataset.contact});
    render();
  });
}
function renderConversation(){
  const box=$("#conversation");if(!box)return;
  box.innerHTML=state.conversation.map(m=>'<div class="message '+esc(m.role)+'"><small>'+esc(m.role==="user"?"OFICIAL":m.role==="computer"?"COMPUTADORA":"SISTEMA")+(m.meta?" · "+esc(m.meta):"")+'</small>'+esc(m.text)+'</div>').join("");
  box.scrollTop=box.scrollHeight;
}
function renderQuickActions(){
  const c=selectedContact(),p=profile();
  let actions=[
    ["Estado de sensores","Dame un informe del estado de sensores"],
    ["Barrido sector","Barrido de largo alcance del sector "+String(state.sim.sector||"041").padStart(3,"0")+", prioridad subespacio"]
  ];
  if(c)actions.push(["Analizar "+c.id,"Analiza "+c.id],["Seguir "+c.id,"Mantén "+c.id+" bajo seguimiento prioritario"]);
  if(p.id==="picard"&&c)actions.push(["Vigilar rumbo","Mantén "+c.id+" bajo seguimiento y avísame si cambia de rumbo"]);
  if(p.id!=="pike"&&effectivePenalty(state.sim)>18)actions.push(["Compensar interferencia","Compensa automáticamente las interferencias"]);
  actions=actions.slice(0,p.id==="pike"?3:p.id==="kirk"?4:5);
  $("#quick-actions").innerHTML=actions.map(([label,cmd])=>'<button class="quick" data-quick="'+esc(cmd)+'">'+esc(label)+'</button>').join("");
  document.querySelectorAll("[data-quick]").forEach(b=>b.onclick=()=>submitCommand(b.dataset.quick,"text"));
}
function line(k,v,cls=""){return '<div class="status-line"><span>'+esc(k)+'</span><strong class="status-value '+cls+'">'+esc(v)+'</strong></div>'}
function angleLabel(v,{signed=false}={}){
  if(v==null||Number.isNaN(Number(v)))return "Sin resolver";
  const n=Number(v);
  if(signed&&n>0)return "+"+n+"°";
  return n+"°";
}
function courseLabel(c){
  const s=contactSpatialSolution(c);
  if(s.courseBearingDeg==null)return "Sin resolver";
  return angleLabel(s.courseBearingDeg)+" / "+angleLabel(s.courseElevationDeg??0,{signed:true});
}
function motionLabel(v){
  return ({approaching:"Aproximándose",receding:"Alejándose",crossing:"Cruce lateral",stationary:"Estable",unknown:"Sin resolver"})[v]||v||"Sin resolver";
}
function distanceLabel(v){
  if(v==null||Number.isNaN(Number(v)))return "Sin resolver";
  return Math.round(Number(v)).toLocaleString("es-ES")+" km";
}
function renderStatus(){
  const sim=state.sim,a=getArray(sim),pen=effectivePenalty(sim);
  $("#ship-status").innerHTML='<section class="status-card"><h3>SENSORES</h3>'+
    line("Escenario",sim.scenarioId)+line("Potencia",sim.power+" %",sim.power<65?"warn":"ok")+
    line("Matriz",a?.id||"—",a?.available?"ok":"bad")+line("Interferencia",pen+" pts",pen>28?"warn":"ok")+
    line("Sector",sim.sector||"—")+'</section>'+
    '<section class="status-card"><h3>CONTEXTO DE NAVE</h3>'+
    (externalShipState()?line("Estado global","Conectado","ok"):line("Estado global","Proveedor preparado"))+
    '</section>'+
    '<section class="status-card"><h3>GUARDIA DE SENSORES</h3>'+
    line("Vigilancia",state.routineWatch.enabled?"24/7 · "+state.routineWatch.mode:"Detenida",state.routineWatch.enabled?"ok":"warn")+
    line("Cobertura","Corto + largo alcance")+
    line("Estado",state.routineWatch.status,state.routineWatch.alertCount?"warn":"ok")+
    line("Informa a",state.routineWatch.reportTo)+
    line("Último ciclo",state.routineWatch.lastCheck||"Preparando")+
    '</section>'+
    (()=>{const c=selectedContact();if(!c)return "";
      const s=contactSpatialSolution(c);
      const identity=c.transponderRecognized&&c.transponderLabel?c.transponderLabel:c.classification;
      return '<section class="status-card selected-contact-status"><h3>CONTACTO SELECCIONADO · '+esc(c.id)+'</h3>'+
        line("Identidad",identity||"Sin resolver")+
        line("Distancia",distanceLabel(c.distanceKm))+
        line("Marcación",angleLabel(s.bearingDeg))+
        line("Elevación",angleLabel(s.elevationDeg,{signed:true}))+
        line("Curso",courseLabel(c))+
        line("Velocidad",c.velocity||"Sin resolver")+
        line("Movimiento relativo",motionLabel(s.relativeMotion),s.relativeMotion==="approaching"?"warn":"")+
        line("Máxima aproximación prevista",s.closestApproachKm!=null?distanceLabel(s.closestApproachKm):"Sin resolver",s.closestApproachKm!=null&&s.closestApproachKm<15000?"warn":"")+
        '</section>';
    })();
  const used=trackingUsed(sim);
  $("#tracking-status").innerHTML='<section class="status-card"><h3>SEGUIMIENTO · '+used+'/'+sim.tracking.capacity+'</h3>'+
    (sim.tracking.assignments.length?sim.tracking.assignments.map(x=>'<div class="track-line">'+esc(x.contactId)+' · '+esc(x.mode)+' · '+esc(x.priority)+'</div>').join(""):'<div class="track-line">Ninguno</div>')+'</section>';
  $("#watch-status").innerHTML='<section class="status-card"><h3>VIGILANCIAS</h3>'+
    (state.watchers.length?state.watchers.map(x=>'<div class="watch-line">'+esc(x.contactId)+' · '+esc(x.condition)+(x.threshold!=null?' · '+esc(x.threshold):'')+'</div>').join(""):'<div class="watch-line">Ninguna</div>')+'</section>';
}
function renderAttention(){
  const box=$("#operator-attention");
  if(!state.attention){box.hidden=true;return}
  box.hidden=false;$("#attention-title").textContent=state.attention.title;$("#attention-text").textContent=state.attention.text;
}
function renderDetails(){
  const box=$("#operation-details-body");
  const rows=state.lastDetails.length?state.lastDetails:[{label:"Estado",value:"Sin operación reciente"}];
  box.innerHTML=rows.map(x=>'<div class="tech-row"><span>'+esc(x.label)+'</span><strong>'+esc(x.value)+'</strong></div>').join("");
}
function render(){
  renderComputer();renderContacts();renderConversation();renderQuickActions();renderStatus();renderAttention();renderDetails();
  const c=selectedContact();$("#context-title").textContent=c?"Contexto · "+c.id+" · "+c.classification:"Esperando órdenes";
}
function setDetails(rows){state.lastDetails=rows;renderDetails()}
function needOperator(title,text){
  state.attention={title,text};renderAttention();addMessage("computer",text,"DECISIÓN NECESARIA");
  return {ok:false,blocked:true,text};
}
function clearAttention(){state.attention=null;renderAttention()}
function detail(label,value){return {label,value:String(value??"—")}}
function targetLabel(v){return String(v||"").startsWith("sector_")?"Sector "+String(v).split("_")[1]:v||"—"}

async function executeAction(a){
  const sim=state.sim;
  if(a.type==="scan"){
    const cfg={
      scanType:a.scanType,mode:a.mode||"passive",targetValue:a.target||a.contactId||"surrounding",
      targetLabel:a.contactId?"Contacto "+a.contactId:targetLabel(a.target),
      contactId:a.contactId||null,resolution:a.resolution||"standard",priority:a.priority||"none",
      duration:a.duration||"standard",filters:Array.isArray(a.filters)?a.filters:["all"]
    };
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"scans"});
    emitTeacherEvent("NAV_SECONDARY",{primaryId:"scans",secondaryId:cfg.scanType});
    if(cfg.contactId){
      state.selectedContactId=cfg.contactId;sim.selectedContactId=cfg.contactId;
      emitTeacherEvent("SELECT_CONTACT",{contactId:cfg.contactId});
      emitTeacherEvent("ACTION",{actionId:"focused_scan",contactId:cfg.contactId});
    }
    emitTeacherEvent("SCAN_CONFIG_CHANGE",{controlId:"target-scope",value:cfg.targetValue,...cfg});
    emitTeacherEvent("SCAN_CONFIG_CHANGE",{controlId:"resolution",value:cfg.resolution,...cfg});
    emitTeacherEvent("SCAN_CONFIG_CHANGE",{controlId:"priority",value:cfg.priority,...cfg});
    const knownBefore=new Set(knownContacts(sim).map(x=>x.id));
    const op=createOperation(sim,"scan:"+cfg.scanType,cfg);
    log("COMPUTER EXECUTE scan "+cfg.scanType+" · "+cfg.targetLabel);
    emitTeacherEvent("SCAN_EXECUTE",{...cfg,operationId:op.id});
    await wait(700);
    const r=resolveScan(sim,op);
    state.lastObservationBatch={
      type:"scan",
      resultId:r.id,
      observations:(r.observations||[]).map(x=>({...x})),
      newIds:(r.observations||[]).map(x=>x.id).filter(id=>!knownBefore.has(id))
    };
    emitTeacherEvent("SCAN_COMPLETE",{operationId:op.id,resultId:r.id,subtype:r.subtype,contactId:cfg.contactId,targetValue:cfg.targetValue});
    setDetails([detail("Operación",r.id),detail("Tipo","Barrido "+cfg.scanType),detail("Objetivo",cfg.targetLabel),detail("Modo",cfg.mode),detail("Resolución",cfg.resolution),detail("Prioridad",cfg.priority),detail("Filtros",cfg.filters.join(", ")),detail("Resultado",r.summary)]);
    return {
      ok:true,
      kind:"scan",
      text:"Barrido completado. "+r.summary,
      resultId:r.id,
      observations:(r.observations||[]).map(x=>({...x})),
      newIds:[...(state.lastObservationBatch?.newIds||[])]
    };
  }

  if(a.type==="search"){
    const cfg={searchType:a.searchType,area:a.area||"sector_041",sensitivity:a.sensitivity||"standard",resolution:a.resolution||"standard",criteria:a.criteria||"",duration:"standard"};
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"search_localize"});
    emitTeacherEvent("NAV_SECONDARY",{primaryId:"search_localize",secondaryId:cfg.searchType});
    const knownBefore=new Set(knownContacts(sim).map(x=>x.id));
    const op=createOperation(sim,"search:"+cfg.searchType,cfg);
    log("COMPUTER EXECUTE search "+cfg.searchType+" · "+cfg.area);
    emitTeacherEvent("SEARCH_EXECUTE",{...cfg,operationId:op.id});
    await wait(700);
    const r=resolveSearch(sim,cfg,op.id);op.state="completed";op.progress=100;
    state.lastObservationBatch={
      type:"search",
      resultId:r.id,
      observations:(r.observations||[]).map(x=>({...x})),
      newIds:(r.observations||[]).map(x=>x.id).filter(id=>!knownBefore.has(id))
    };
    emitTeacherEvent("SEARCH_COMPLETE",{operationId:op.id,resultId:r.id,subtype:r.subtype,targetValue:cfg.area});emitTeacherEvent("RESULT_OPEN",{resultId:r.id,type:"search",subtype:r.subtype,target:r.target});
    setDetails([detail("Operación",r.id),detail("Tipo","Búsqueda "+cfg.searchType),detail("Área",targetLabel(cfg.area)),detail("Sensibilidad",cfg.sensitivity),detail("Resolución",cfg.resolution),detail("Resultado",r.summary)]);
    return {
      ok:true,
      kind:"search",
      text:"Búsqueda completada. "+r.summary,
      resultId:r.id,
      observations:(r.observations||[]).map(x=>({...x})),
      newIds:[...(state.lastObservationBatch?.newIds||[])]
    };
  }

  if(a.type==="track_start"){
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"tracking"});emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"multi_track"});
    const r=startTracking(sim,a.contactId,"normal",a.priority||"normal");
    if(!r.ok)return needOperator("Capacidad de seguimiento",r.reason+". Indique qué asignación desea modificar.");
    state.selectedContactId=a.contactId;sim.selectedContactId=a.contactId;
    emitTeacherEvent("TRACK_START",{contactId:a.contactId,mode:"normal",priority:a.priority||"normal"});
    if(a.priority==="priority")emitTeacherEvent("TRACK_PRIORITY",{contactId:a.contactId,priority:"priority"});
    setDetails([detail("Contacto",a.contactId),detail("Seguimiento","normal"),detail("Prioridad",a.priority||"normal"),detail("Capacidad",trackingUsed(sim)+" / "+sim.tracking.capacity)]);
    return {ok:true,text:"Seguimiento establecido sobre "+a.contactId+(a.priority==="priority"?" con prioridad alta.":".")};
  }

  if(a.type==="track_stop"){
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"tracking"});emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"multi_track"});
    stopTracking(sim,a.contactId);emitTeacherEvent("TRACK_STOP",{contactId:a.contactId});
    setDetails([detail("Contacto",a.contactId),detail("Seguimiento","finalizado"),detail("Capacidad",trackingUsed(sim)+" / "+sim.tracking.capacity)]);
    return {ok:true,text:"Seguimiento de "+a.contactId+" finalizado."};
  }

  if(a.type==="track_priority"){
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"tracking"});emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"multi_track"});
    const c=getContact(sim,a.contactId);if(!c?.tracked)return needOperator("Seguimiento inexistente",a.contactId+" no está actualmente en seguimiento.");
    const r=startTracking(sim,a.contactId,c.trackingMode||"normal",a.priority||"normal",c.trackingSignature||null);
    if(!r.ok)return needOperator("Capacidad de seguimiento",r.reason+".");
    emitTeacherEvent("TRACK_PRIORITY",{contactId:a.contactId,priority:a.priority});
    setDetails([detail("Contacto",a.contactId),detail("Prioridad",a.priority),detail("Capacidad",trackingUsed(sim)+" / "+sim.tracking.capacity)]);
    return {ok:true,text:"Prioridad de "+a.contactId+" ajustada a "+a.priority+"."};
  }

  if(a.type==="track_signature"){
    const pri=a.priority||"priority",r=startTracking(sim,a.contactId,"signature",pri,a.signature);
    if(!r.ok)return needOperator("Capacidad de seguimiento",r.reason+". Indique qué recurso desea liberar.");
    state.selectedContactId=a.contactId;sim.selectedContactId=a.contactId;
    emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"track_signature"});
    emitTeacherEvent("TRACK_SIGNATURE",{contactId:a.contactId,signature:a.signature});
    if(pri==="priority")emitTeacherEvent("TRACK_PRIORITY",{contactId:a.contactId,priority:"priority"});
    setDetails([detail("Contacto",a.contactId),detail("Modo","firma concreta"),detail("Firma",a.signature),detail("Prioridad",pri),detail("Capacidad",trackingUsed(sim)+" / "+sim.tracking.capacity)]);
    return {ok:true,text:"Seguimiento de firma "+a.signature+" establecido sobre "+a.contactId+"."};
  }

  if(a.type==="track_update"){
    emitTeacherEvent("NAV_PRIMARY",{primaryId:"tracking"});
    if(a.operation==="trajectory")emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"predict_trajectory"});
    if(a.operation==="reacquire")emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"reacquire_lost_contact"});
    const kind=a.operation==="reacquire"?"reacquire":a.operation;
    const r=updateTracking(sim,a.contactId,kind,{horizon:a.horizon||"5 min"});
    if(!r.ok)return needOperator("Operación de seguimiento",r.reason+".");
    if(kind==="reacquire")emitTeacherEvent("REACQUIRE",{contactId:a.contactId});
    else emitTeacherEvent("TRACK_OPERATION",{contactId:a.contactId,operation:kind});
    setDetails([detail("Contacto",a.contactId),detail("Operación",kind),detail("Resultado",r.value||"Completada")]);
    return {ok:true,text:r.value||"Operación de seguimiento completada."};
  }

  if(a.type==="readout"){
    const r=readout(sim,a.contactId,a.readout);if(!r)return needOperator("Lectura no disponible","No existe una lectura válida para "+a.contactId+".");
    state.selectedContactId=a.contactId;sim.selectedContactId=a.contactId;
    emitTeacherEvent("READOUT_OPEN",{contactId:a.contactId,readout:a.readout});emitTeacherEvent("NAV_PRIMARY",{primaryId:"sensor_readout"});
    const secondaryMap={subspace_signature:"subspace_signature",signal_strength:"signal_strength",signature_type:"signature_type"};
    if(secondaryMap[a.readout])emitTeacherEvent("NAV_SECONDARY",{primaryId:"sensor_readout",secondaryId:secondaryMap[a.readout]});
    setDetails([detail("Contacto",a.contactId),detail("Lectura",a.readout),detail("Valor",r.value),detail("Confianza",r.confidence+" %"),detail("Incertidumbre",r.uncertainty)]);
    return {ok:true,text:a.contactId+": "+r.value+". Confianza "+r.confidence+"%."};
  }

  if(a.type==="transfer"){
    const tx=transferData(sim,a.target,a.contactId,{source:"computer_v02"});
    emitTeacherEvent("HANDOFF",{target:a.target,contactId:a.contactId,transferId:tx.id});
    setDetails([detail("Transferencia",tx.id),detail("Contacto",a.contactId),detail("Destino",a.target.toUpperCase()),detail("Estado",tx.state)]);
    return {ok:true,text:"Datos de "+a.contactId+" enviados a "+a.target.toUpperCase()+"."};
  }

  if(a.type==="power_request"){
    const req={requested:Number(a.requested)||10,priority:a.priority||"Operativa",duration:"single_operation",reason:a.reason||"Solicitud del oficial",contactId:state.selectedContactId||null,state:"PENDIENTE"};
    sim.powerRequest=req;emitTeacherEvent("ACTION",{actionId:"request_additional_power",contactId:req.contactId});emitTeacherEvent("POWER_REQUEST",{requestedDelta:req.requested,priority:req.priority,contactId:req.contactId});
    log("POWER REQUEST +"+req.requested+"% → OPS");await wait(450);
    sim.powerRequest=makePowerResponse(sim,req);emitTeacherEvent("POWER_RESPONSE",{state:sim.powerRequest.state,grantedDelta:sim.powerRequest.granted});
    setDetails([detail("Solicitud",req.requested+" %"),detail("Prioridad",req.priority),detail("Respuesta",sim.powerRequest.state),detail("Concedido",sim.powerRequest.granted+" %")]);
    return {ok:true,text:"Operaciones responde "+sim.powerRequest.state+". Potencia concedida: "+sim.powerRequest.granted+"%."};
  }

  if(a.type==="power_release"){
    const req=sim.powerRequest;
    if(!req)return {ok:true,text:"No hay ninguna solicitud de potencia activa."};
    const granted=Number(req.granted||0);
    if(a.mode==="cancel_pending"&&!granted){
      req.state="CANCELADA";emitTeacherEvent("POWER_CANCEL",{});setDetails([detail("Solicitud","Cancelada"),detail("Potencia liberada","0 %")]);
      return {ok:true,text:"Solicitud de potencia cancelada."};
    }
    if(granted>0){
      sim.power=Math.max(sim.basePower,sim.power-granted);sim.powerBudget+=granted;req.state="LIBERADA";
      emitTeacherEvent("POWER_RELEASE",{releasedDelta:granted});
      setDetails([detail("Solicitud","Liberada"),detail("Potencia devuelta",granted+" %"),detail("Potencia actual",sim.power+" %")]);
      return {ok:true,text:"Potencia adicional liberada y devuelta a Operaciones: "+granted+"%."};
    }
    req.state="CANCELADA";emitTeacherEvent("POWER_CANCEL",{});
    return {ok:true,text:"Solicitud de potencia cancelada."};
  }

  if(a.type==="interference"){
    let engineAction=a.operation,payload={band:a.band,contactId:a.contactId,value:a.value,resolution:a.resolution};
    if(a.operation==="extend_integration")engineAction="extend";
    if(a.operation==="recover_signal")engineAction="recover";
    if(a.operation==="operation_power")engineAction="power";
    if(a.operation==="reduce_resolution")engineAction="reduce_resolution";
    const r=applyInterference(sim,engineAction,payload);
    if(!r.ok)return needOperator("Compensación",r.reason||"No se pudo aplicar la compensación.");
    if(a.operation==="manual"){
      if(a.sensitivity)sim.config.sensitivity=a.sensitivity;
      if(a.resolution)sim.config.defaultResolution=a.resolution;
      if(a.integration==="extended")applyInterference(sim,"extend");
    }
    emitTeacherEvent("INTERFERENCE_ACTION",{action:a.operation,band:a.band||null,value:a.value??null,resolution:a.resolution||null,contactId:a.contactId||null});
    setDetails([
      detail("Interferencia",a.operation),
      detail("Banda",a.band||sim.config.bandFrequency),
      detail("Resolución",a.resolution||sim.config.defaultResolution),
      detail("Potencia operación",sim.config.operationPower+" %"),
      detail("Penalización efectiva",effectivePenalty(sim)),
      detail("Resultado",r.message||r.value||"Aplicado")
    ]);
    return {ok:true,text:(r.message||r.value||"Compensación aplicada")+"."};
  }

  if(a.type==="diagnostic"){
    const d=runDiagnostic(sim,a.scope||"all");emitTeacherEvent("DIAGNOSTIC_RUN",{scope:a.scope||"all",status:d.status,issues:d.issues.length});
    setDetails([detail("Diagnóstico",d.id),detail("Ámbito",a.scope||"all"),detail("Estado",d.status),detail("Incidencias",d.issues.length)]);
    return {ok:true,text:"Diagnóstico "+d.status+". "+d.issues.length+" incidencia(s)."};
  }

  if(a.type==="calibrate"){
    const r=calibrateArray(sim,a.arrayId);if(!r.ok)return needOperator("Calibración",r.reason);
    emitTeacherEvent("CALIBRATION",{arrayId:a.arrayId});setDetails([detail("Matriz",a.arrayId),detail("Resultado",r.message)]);
    return {ok:true,text:r.message+"."};
  }

  if(a.type==="select_array"){
    const r=applyConfig(sim,"sensor_array",a.arrayId);if(!r.ok)return needOperator("Selección de matriz",r.reason);
    emitTeacherEvent("CONFIG_APPLY",{setting:"sensor_array",value:a.arrayId});setDetails([detail("Matriz activa",a.arrayId)]);
    return {ok:true,text:"Matriz "+a.arrayId+" seleccionada."};
  }

  if(a.type==="engineering_request"){
    const req=requestEngineering(sim,{component:a.component,diagnosticCode:a.diagnosticCode||"",problem:a.reason||"Solicitud de Sensores",priority:a.priority||"Normal"});
    emitTeacherEvent("ENGINEERING_REQUEST",{component:a.component,requestId:req.id});
    setDetails([detail("Solicitud",req.id),detail("Componente",a.component),detail("Estado",req.state)]);
    return {ok:true,text:"Solicitud enviada a Ingeniería para "+a.component+"."};
  }

  if(a.type==="mark"){
    const c=getContact(sim,a.contactId);if(!c)return needOperator("Contacto inexistente","No encuentro "+a.contactId+".");
    c.marked=!!a.marked;emitTeacherEvent("CONTACT_MARK",{contactId:a.contactId,marked:!!a.marked});
    setDetails([detail("Contacto",a.contactId),detail("Marca",a.marked?"ACTIVA":"RETIRADA")]);
    return {ok:true,text:a.marked?a.contactId+" marcado como relevante.":"Marca retirada de "+a.contactId+"."};
  }

  if(a.type==="mark_matches"){
    const batch=state.lastObservationBatch;
    if(!batch)return needOperator("Sin resultados","No hay un barrido o búsqueda reciente sobre el que aplicar la condición.");
    const sourceOk=a.source==="last_operation"||a.source==="last_"+batch.type;
    if(!sourceOk)return needOperator("Resultado incompatible","La condición pide "+a.source+" pero el último resultado es "+batch.type+".");
    const min=Number(a.minConfidence)||0;
    const newSet=new Set(batch.newIds||[]);
    const matches=(batch.observations||[]).filter(x=>{
      if(a.newOnly&&!newSet.has(x.id))return false;
      const score=Number(x.confidence??x.match??0);
      return score>=min;
    });
    const changed=[];
    for(const x of matches){
      const contact=getContact(sim,x.id);
      if(!contact)continue;
      contact.marked=!!a.marked;
      changed.push(contact.id);
      emitTeacherEvent("CONTACT_MARK",{contactId:contact.id,marked:!!a.marked,conditional:true});
    }
    setDetails([
      detail("Origen",batch.resultId),
      detail("Solo nuevos",a.newOnly?"Sí":"No"),
      detail("Confianza mínima",min+" %"),
      detail("Coincidencias",changed.length?changed.join(", "):"Ninguna")
    ]);
    if(!changed.length)return {
      ok:true,
      kind:"mark_matches",
      text:"Ningún contacto del último resultado cumple la condición de marcado.",
      changedIds:[],
      minConfidence:min,
      newOnly:!!a.newOnly,
      marked:!!a.marked
    };
    return {
      ok:true,
      kind:"mark_matches",
      text:(a.marked?"Marcados ":"Desmarcados ")+changed.join(", ")+" según la condición indicada.",
      changedIds:changed,
      minConfidence:min,
      newOnly:!!a.newOnly,
      marked:!!a.marked
    };
  }

  if(a.type==="save_result"){
    const r0=a.resultId?sim.results.find(x=>x.id===a.resultId):sim.results[0];if(!r0)return needOperator("Sin resultados","No hay un resultado disponible para guardar.");
    const r=saveReading(sim,r0.id,"Guardado por computadora");if(!r.ok)return needOperator("Guardado",r.reason);
    emitTeacherEvent("RESULT_SAVE",{resultId:r0.id,savedId:r.saved.savedId});setDetails([detail("Resultado",r0.id),detail("Guardado",r.saved.savedId)]);
    return {ok:true,text:"Resultado guardado como "+r.saved.savedId+"."};
  }

  if(a.type==="compare_results"){
    const ra=a.a?sim.results.find(x=>x.id===a.a)||sim.savedReadings.find(x=>x.savedId===a.a):sim.results[0];
    const rb=a.b?sim.results.find(x=>x.id===a.b)||sim.savedReadings.find(x=>x.savedId===a.b):sim.results[1];
    if(!ra||!rb)return needOperator("Comparación","Necesito al menos dos lecturas disponibles.");
    const r=compareReadings(sim,ra.id||ra.savedId,rb.id||rb.savedId);if(!r.ok)return needOperator("Comparación",r.reason);
    emitTeacherEvent("RESULT_COMPARE",{a:ra.id||ra.savedId,b:rb.id||rb.savedId});
    setDetails([detail("Comparación",r.comparison.id),detail("A",ra.id||ra.savedId),detail("B",rb.id||rb.savedId),detail("Resultado",r.comparison.summary)]);
    return {ok:true,text:r.comparison.summary+"."};
  }

  if(a.type==="repeat_operation"){
    const source=a.resultId?sim.results.find(x=>x.id===a.resultId):sim.results[0];
    if(!source)return needOperator("Repetición","No hay una operación anterior que repetir.");
    const cfg={...(source.configuration||{}),...(a.overrides||{})};
    log("COMPUTER REPEAT "+source.id);emitTeacherEvent("RESULT_REPEAT",{sourceResultId:source.id,type:source.type});
    if(source.type==="scan"){
      const op=createOperation(sim,"scan:"+source.subtype,cfg);await wait(650);const r=resolveScan(sim,op);
      emitTeacherEvent("SCAN_COMPLETE",{operationId:op.id,resultId:r.id,subtype:r.subtype,contactId:cfg.contactId||null,targetValue:cfg.targetValue||null});
      setDetails([detail("Origen",source.id),detail("Nueva operación",r.id),detail("Tipo","Barrido "+source.subtype),detail("Resultado",r.summary)]);
      return {ok:true,text:"Operación "+source.id+" repetida como "+r.id+". "+r.summary};
    }
    if(source.type==="search"){
      const op=createOperation(sim,"search:"+source.subtype,cfg);await wait(650);const r=resolveSearch(sim,cfg,op.id);op.state="completed";op.progress=100;
      emitTeacherEvent("SEARCH_COMPLETE",{operationId:op.id,resultId:r.id,subtype:r.subtype,targetValue:cfg.area});
      setDetails([detail("Origen",source.id),detail("Nueva operación",r.id),detail("Tipo","Búsqueda "+source.subtype),detail("Resultado",r.summary)]);
      return {ok:true,text:"Operación "+source.id+" repetida como "+r.id+". "+r.summary};
    }
    return needOperator("Repetición","El tipo de resultado "+source.type+" no es repetible.");
  }

  if(a.type==="cancel_operation"){
    const running=sim.operations.filter(x=>x.state==="running");
    const op=a.operationId?running.find(x=>x.id===a.operationId):running[0];
    if(!op)return {ok:true,text:"No hay ninguna operación activa que cancelar."};
    op.state="cancelled";emitTeacherEvent("OPERATION_CANCEL",{operationId:op.id});
    setDetails([detail("Operación",op.id),detail("Estado","CANCELADA")]);
    return {ok:true,text:"Operación "+op.id+" cancelada."};
  }

  if(a.type==="load_profile"){
    const r=loadProfile(sim,a.profileId);if(!r.ok)return needOperator("Perfil",r.reason);
    emitTeacherEvent("PROFILE_LOAD",{profileId:a.profileId});setDetails([detail("Perfil",a.profileId),detail("Resultado","Cargado")]);
    return {ok:true,text:"Perfil "+a.profileId+" cargado."};
  }

  if(a.type==="save_profile"){
    const r=saveProfile(sim,a.profileId,a.name);if(!r.ok)return needOperator("Guardar perfil",r.reason);
    emitTeacherEvent("PROFILE_SAVE",{profileId:a.profileId});setDetails([detail("Perfil",a.profileId),detail("Nombre",a.name),detail("Resultado","Guardado")]);
    return {ok:true,text:"Perfil "+a.name+" guardado como "+a.profileId+"."};
  }

  if(a.type==="delete_profile"){
    const r=deleteProfile(sim,a.profileId);if(!r.ok)return needOperator("Eliminar perfil",r.reason);
    setDetails([detail("Perfil",a.profileId),detail("Resultado","Eliminado")]);
    return {ok:true,text:"Perfil "+a.profileId+" eliminado."};
  }

  if(a.type==="restore_standard"){
    restoreStandard(sim);emitTeacherEvent("CONFIG_RESTORE",{profile:"standard"});
    setDetails([detail("Configuración","Estándar de la nave"),detail("Perfil",sim.config.profile),detail("Matriz",sim.activeArray)]);
    return {ok:true,text:"Configuración estándar de Sensores restaurada."};
  }

  if(a.type==="apply_config"){
    const keyMap={
      sensitivity:"sensitivity",default_resolution:"defaultResolution",sensor_power:"sensor_power",
      sensor_array:"sensor_array",band_frequency:"bandFrequency",update_rate:"updateRate",
      default_filters:"defaultFilters",default_priorities:"defaultPriority"
    };
    const key=keyMap[a.setting]||a.setting;
    const r=applyConfig(sim,key,a.value);if(!r.ok)return needOperator("Configuración",r.reason);
    emitTeacherEvent("CONFIG_APPLY",{setting:a.setting,value:a.value});
    setDetails([detail("Ajuste",a.setting),detail("Valor",Array.isArray(a.value)?a.value.join(", "):a.value)]);
    return {ok:true,text:"Configuración aplicada: "+a.setting+" = "+(Array.isArray(a.value)?a.value.join(", "):a.value)+"."};
  }

  if(a.type==="watch"){
    const c=getContact(sim,a.contactId);if(!c)return needOperator("Vigilancia","No encuentro "+a.contactId+".");
    state.watchers=state.watchers.filter(x=>!(x.contactId===a.contactId&&x.condition===a.condition));
    const spatial=contactSpatialSolution(c);
    state.watchers.push({contactId:a.contactId,condition:a.condition,threshold:a.threshold??null,baseline:{courseBearingDeg:spatial.courseBearingDeg,courseElevationDeg:spatial.courseElevationDeg,status:c.status,confidence:c.confidence},createdAt:Date.now()});
    setDetails([detail("Contacto",a.contactId),detail("Vigilancia",a.condition),detail("Umbral",a.threshold??"—")]);
    return {ok:true,text:"Vigilancia activada sobre "+a.contactId+". Le avisaré si se cumple la condición."};
  }

  if(a.type==="query"){
    let text="",rows=[];
    const domain=a.domain,filter=a.filter||"all";
    if(domain==="arrays"){
      rows=sim.arrays.map(x=>detail(x.id,(x.available?"DISPONIBLE":"NO DISPONIBLE")+" · integridad "+x.integrity+"% · calibración "+x.calibration+"%"));
      text=sim.arrays.map(x=>x.id+" "+(x.available?"disponible":"no disponible")+", integridad "+x.integrity+"%").join(". ")+".";
    }else if(domain==="effective_range"){
      const arr=getArray(sim);const range=Math.max(0,Math.round((arr?.integrity||0)*0.65+(arr?.calibration||0)*0.35-effectivePenalty(sim)*0.45));
      rows=[detail("Alcance efectivo relativo",range+" %"),detail("Matriz",sim.activeArray),detail("Interferencia",effectivePenalty(sim)+" pts")];
      text="Alcance efectivo relativo "+range+"% con la matriz "+sim.activeArray+".";
    }else if(domain==="resolution"){
      rows=[detail("Predeterminada",sim.config.defaultResolution),detail("Sensibilidad",sim.config.sensitivity),detail("Interferencia",effectivePenalty(sim)+" pts")];
      text="Resolución predeterminada "+sim.config.defaultResolution+"; sensibilidad "+sim.config.sensitivity+".";
    }else if(domain==="power"){
      rows=[detail("Potencia sensores",sim.power+" %"),detail("Potencia operación",sim.config.operationPower+" %"),detail("Reserva disponible",sim.powerBudget+" %")];
      text="Sensores al "+sim.power+"%. Potencia de operación "+sim.config.operationPower+"%. Reserva "+sim.powerBudget+"%.";
    }else if(domain==="integrity"){
      rows=sim.arrays.map(x=>detail(x.id,"integridad "+x.integrity+"% · calibración "+x.calibration+"%"));
      text=sim.arrays.map(x=>x.id+" integridad "+x.integrity+"%").join(". ")+".";
    }else if(domain==="interference"){
      rows=[detail("Severidad",sim.interference.severity),detail("Banda",sim.interference.band),detail("Penalización efectiva",effectivePenalty(sim)),detail("Compensación",sim.interference.compensation)];
      text="Interferencia "+sim.interference.severity+", penalización efectiva "+effectivePenalty(sim)+" puntos, compensación "+sim.interference.compensation+".";
    }else if(domain==="active_operations"){
      const ops=sim.operations.filter(x=>x.state==="running");
      rows=ops.length?ops.map(x=>detail(x.id,x.type+" · "+x.state)):[detail("Operaciones","Ninguna activa")];
      text=ops.length?ops.map(x=>x.id+" "+x.type).join(", "):"No hay operaciones activas.";
    }else if(domain==="contacts"){
      let list=knownContacts(sim);
      if(filter==="unidentified")list=list.filter(x=>x.status==="unidentified");
      if(filter==="identified")list=list.filter(x=>x.status==="identified");
      if(filter==="marked")list=list.filter(x=>x.marked);
      if(filter==="lost")list=list.filter(x=>x.status==="lost");
      rows=list.map(x=>detail(x.id,x.classification+" · "+Math.round(x.confidence)+"%"+(x.tracked?" · seguido":"")));
      text=list.length?list.map(x=>x.id+" "+x.classification+" "+Math.round(x.confidence)+"%").join(". ")+".":"No hay contactos que cumplan el filtro.";
    }else if(domain==="tracking"){
      rows=sim.tracking.assignments.length?sim.tracking.assignments.map(x=>detail(x.contactId,x.mode+" · "+x.priority+" · calidad "+Math.round(x.quality)+"%")):[detail("Seguimientos","Ninguno")];
      rows.unshift(detail("Capacidad",trackingUsed(sim)+" / "+sim.tracking.capacity));
      text="Seguimiento "+trackingUsed(sim)+"/"+sim.tracking.capacity+(sim.tracking.assignments.length?". "+sim.tracking.assignments.map(x=>x.contactId+" "+x.priority).join(", "):".");
    }else if(domain==="results"){
      let list=filter==="saved"?sim.savedReadings:sim.results;
      list=list.slice(0,filter==="recent"?5:10);
      rows=list.length?list.map(x=>detail(x.savedId||x.id,(x.type||"resultado")+" · "+(x.subtype||"")+" · "+(x.summary||x.label||""))):[detail("Resultados","Ninguno")];
      text=list.length?list.map(x=>(x.savedId||x.id)+" "+(x.summary||x.label||"")).join(". ")+".":"No hay resultados disponibles.";
    }else if(domain==="diagnostics"){
      const list=sim.diagnostics.slice(0,10);
      rows=list.length?list.map(x=>detail(x.id,x.status+" · "+x.scope+" · "+x.issues.length+" incidencia(s)")):[detail("Diagnósticos","Ninguno ejecutado")];
      text=list.length?list.map(x=>x.id+" "+x.status).join(", "):"No se han ejecutado diagnósticos.";
    }else if(domain==="profiles"){
      rows=Object.entries(sim.profiles).map(([id,p])=>detail(id,(p.name||id)+" · "+p.origin+(p.readOnly?" · protegido":"")));
      text=Object.keys(sim.profiles).join(", ")+".";
    }else{
      return executeAction({type:"status",scope:"sensors",contactId:a.contactId||null});
    }
    setDetails(rows);return {ok:true,text};
  }

  if(a.type==="status"){
    if(a.scope==="tracking"){emitTeacherEvent("NAV_PRIMARY",{primaryId:"tracking"});emitTeacherEvent("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"tracked_contacts"});}
    else if(a.scope==="sensors")emitTeacherEvent("NAV_PRIMARY",{primaryId:"status"});
    const c=a.contactId?getContact(sim,a.contactId):selectedContact();
    let text;
    if(a.scope==="tracking")text="Seguimiento "+trackingUsed(sim)+"/"+sim.tracking.capacity+".";
    else if(a.scope==="contact"&&c)text=c.id+": "+c.classification+", confianza "+Math.round(c.confidence)+"%, "+(c.tracked?"en seguimiento.":"sin seguimiento.");
    else if(a.scope==="ship"&&externalShipState())text="Estado global de nave disponible en el proveedor conectado.";
    else text="Sensores "+(effectivePenalty(sim)>28?"degradados":"operativos")+". Potencia "+sim.power+"%. Matriz "+sim.activeArray+". Interferencia "+effectivePenalty(sim)+" puntos.";
    setDetails([detail("Consulta",a.scope),detail("Respuesta",text)]);return {ok:true,text};
  }

  return needOperator("Acción no implementada","La orden contiene una acción que este prototipo todavía no puede ejecutar: "+a.type+".");
}

async function executePlan(plan){
  clearAttention();state.lastPlan=plan;
  const results=[];
  for(const action of plan.actions){
    const r=await executeAction(action);results.push(r);
    if(action?.contactId){
      state.routineWatch.newUnknownIds=(state.routineWatch.newUnknownIds||[]).filter(id=>id!==action.contactId);
    }
    render();
    if(!r.ok)break;
  }
  return results;
}

async function submitCommand(text,inputMode="text"){
  text=String(text||"").trim();if(!text||state.busy)return;
  state.busy=true;$("#send-command").disabled=true;$("#voice-button").disabled=true;
  addMessage("user",text,inputMode==="voice"?"VOZ":"TEXTO");log("ORDER "+text);
  try{
    const context=buildContext();
    const interpreted=await interpretCommand({text,context,profileId:state.profileId,inputMode,routingMode:state.routingMode});

    if(
      state.routingMode==="auto" &&
      interpreted.provider==="gemini" &&
      !interpreted.escalated &&
      interpreted.economyReason==="contract_validation"
    ){
      const localPlan=localInterpret(text,context,state.profileId);
      const localValidation=validateCommandPlan(localPlan,state.profileId);
      if(localValidation.ok&&!localValidation.plan?.needsClarification){
        interpreted.plan=localValidation.plan;
        interpreted.economyReason="local_interpreter_repair";
        interpreted.locallyRepaired=true;
      }
    }

    state.aiRuntime={
      provider:interpreted.provider||null,
      modelUsed:interpreted.modelUsed||null,
      escalated:!!interpreted.escalated
    };
    $("#ai-badge").textContent=interpreted.provider==="gemini"?(interpreted.escalated?"GEMINI 3.8 · ESCALADO":"GEMINI · "+(interpreted.modelUsed||"")):interpreted.provider==="fallback"?"GEMINI → FALLBACK":"INTÉRPRETE LOCAL";
    if(interpreted.escalated){
      const reason=interpreted.escalationReason==="default_model_unavailable"
        ?"3.5 Flash-Lite siguió sin disponible tras el reintento → escalado automático a 3.8 Flash."
        :"3.5 Flash-Lite no pudo interpretar la orden con suficiente seguridad → escalado automático a 3.8 Flash.";
      addMessage("system",reason,"RUTA GEMINI");
      addMessage("system",interpreted.retryCount>0
        ?"3.8 Flash respondió correctamente tras un reintento → se usará su interpretación."
        :"3.8 Flash respondió correctamente → se usará su interpretación.","RUTA GEMINI");
      log("GEMINI ESCALATION · "+(interpreted.escalationReason||"unspecified")+" · "+(interpreted.modelUsed||"3.8"));
    }else if(
      interpreted.provider==="fallback" &&
      state.routingMode==="auto" &&
      (String(interpreted.warning||"").includes("Gemini 503") || String(interpreted.warning||"").toLowerCase().includes("json"))
    ){
      addMessage("system","3.5 Flash-Lite siguió fallando tras el reintento → se intentó automáticamente 3.8 Flash.","RUTA GEMINI");
      addMessage("system","3.8 Flash también falló tras el reintento → intérprete local.","RUTA GEMINI");
      log("GEMINI AUTO ROUTE · 3.5 failed · 3.8 failed · local fallback");
    }
    if(interpreted.provider==="gemini"&&!interpreted.escalated&&interpreted.retryCount>0){
      addMessage("system",(interpreted.modelUsed||"Gemini")+" respondió correctamente en el reintento.","RUTA GEMINI");
      log("GEMINI RETRY SUCCESS · "+(interpreted.modelUsed||"unknown"));
    }
    if(interpreted.economyProtected){
      const msg=interpreted.economyReason==="local_contract_repair"
        ?"3.5 entendió la intención pero devolvió una estructura incompatible. La Computadora la corrigió localmente sin usar 3.8."
        :interpreted.economyReason==="local_interpreter_repair"
          ?"3.5 devolvió un contrato inválido, pero la intención era inequívoca. La Computadora la normalizó localmente sin usar 3.8."
          :interpreted.economyReason==="contract_validation"
            ?"3.5 respondió, pero la orden no encaja todavía con seguridad en el contrato. 3.8 NO se ha usado para proteger su cuota."
            :"3.5 pidió aclaración. 3.8 NO se ha usado para proteger su cuota.";
      if(["local_contract_repair","local_interpreter_repair"].includes(interpreted.economyReason)){
        log("AUTO ECONÓMICO · "+msg);
      }else{
        addMessage("system",msg,"AUTO ECONÓMICO");
      }
      log("GEMINI ECONOMY PROTECT · "+(interpreted.economyReason||"unspecified")+" · 3.8 not used");
    }
    if(interpreted.warning)addMessage("system",interpreted.warning);
    const lowText=text.toLowerCase();
    if(interpreted.provider==="fallback"&&lowText.includes("barrido")&&lowText.includes("marca")){
      needOperator(
        "Orden compuesta reservada para Gemini",
        "Gemini no está disponible y el intérprete local no ejecutará parcialmente una condición posterior al barrido. Repita la orden cuando Gemini responda o divídala en dos órdenes."
      );
      log("LOCAL FALLBACK BLOCKED · compound scan + conditional mark");
      return;
    }
    const validation=validateCommandPlan(interpreted.plan,state.profileId);
    if(!validation.ok){
      needOperator("Contrato rechazado",validation.errors.join(" "));
      setDetails(validation.errors.map((x,i)=>detail("Error "+(i+1),x)));
      return;
    }
    const plan=validation.plan;
    if(plan.needsClarification){
      needOperator("Aclaración necesaria",plan.clarificationQuestion);
      setDetails(planPreview(plan));return;
    }
    setDetails(planPreview(plan));
    const results=await executePlan(plan);
    const ok=results.length&&results.every(x=>x.ok);
    if(ok){
      const response=composeComputerResponse({plan,results});
      addMessage("computer",response||"Operación completada.");
    }
  }catch(e){
    needOperator("Error de interpretación o ejecución",e.message||String(e));
    log("ERROR "+(e.stack||e.message||e));
  }finally{
    state.busy=false;
    syncRoutineWatchBaseline();
    $("#send-command").disabled=false;$("#voice-button").disabled=false;render();
  }
}

function routineWatchSnapshot(){
  if(!state.sim)return null;
  const cycle=passiveSurveillanceCycle(state.sim);
  state.routineWatch.lastCycle=cycle;
  return {
    time:cycle.time,
    contacts:cycle.observations.map(x=>({...x})),
    nonDetections:cycle.nonDetections.map(x=>({...x})),
    sensors:{
      array:state.sim.activeArray,
      arrayAvailable:!!getArray(state.sim)?.available,
      integrity:Number(getArray(state.sim)?.integrity||0),
      calibration:Number(getArray(state.sim)?.calibration||0),
      interference:effectivePenalty(state.sim)
    }
  };
}

function syncRoutineWatchBaseline(){
  const snap=routineWatchSnapshot();
  if(!snap)return;
  state.routineWatch.baseline=snap;
  state.routineWatch.lastCheck=new Date().toLocaleTimeString("es-ES",{hour12:false});
  state.routineWatch.checks++;
}

function routineWatchTick(){
  if(!state.routineWatch.enabled||!state.sim)return;
  const current=routineWatchSnapshot();
  const previous=state.routineWatch.baseline;
  if(!previous){syncRoutineWatchBaseline();renderStatus();return}

  const events=[];
  const prevMap=new Map(previous.contacts.map(x=>[x.id,x]));
  const currentMap=new Map(current.contacts.map(x=>[x.id,x]));
  const nonDetectMap=new Map((current.nonDetections||[]).map(x=>[x.id,x]));

  for(const cur of current.contacts){
    const prev=prevMap.get(cur.id);
    if(!prev){
      const unknown=!cur.transponderRecognized&&(cur.identificationSource==="unknown"||cur.status==="unidentified"||String(cur.classification||"").toLowerCase().includes("no identificado"));
      if(unknown){
        if(!state.routineWatch.newUnknownIds.includes(cur.id))state.routineWatch.newUnknownIds.push(cur.id);
        events.push({
          severity:"warning",
          type:"new_unknown_contact",
          text:"Nuevo contacto desconocido: "+cur.id+" · confianza "+cur.confidence+"% · distancia "+distanceLabel(cur.distanceKm)+" · marcación "+angleLabel(cur.bearingDeg)+" · elevación "+angleLabel(cur.elevationDeg,{signed:true})+"."
        });
      }else{
        const source=cur.transponderRecognized?"transpondedor reconocido":"correlación de sensores";
        const identity=cur.transponderLabel||cur.classification||"Identidad resuelta";
        const priority=cur.operationalPriority==="high";
        events.push({
          severity:priority?"warning":"routine",
          type:priority?"new_priority_contact":"new_identified_contact",
          text:(priority?"CONTACTO PRIORITARIO: ":"Nuevo contacto identificado: ")+cur.id+" · "+identity+
            (cur.affiliation?" · "+cur.affiliation:"")+" · "+source+
            " · confianza "+cur.confidence+"% · distancia "+distanceLabel(cur.distanceKm)+
            " · marcación "+angleLabel(cur.bearingDeg)+" · elevación "+angleLabel(cur.elevationDeg,{signed:true})+
            (cur.courseBearingDeg!=null?" · curso "+angleLabel(cur.courseBearingDeg)+" / "+angleLabel(cur.courseElevationDeg??0,{signed:true}):"")+
            (cur.relativeMotion?" · "+motionLabel(cur.relativeMotion).toLowerCase():"")+
            (priority?". No se detecta actitud hostil confirmada.":".")
        });
      }
      continue;
    }

    if(prev.courseBearingDeg!==cur.courseBearingDeg||prev.courseElevationDeg!==cur.courseElevationDeg){
      if(prev.courseBearingDeg!=null||cur.courseBearingDeg!=null){
        events.push({severity:"routine",type:"course_change",text:cur.id+" ha cambiado de curso: "+angleLabel(cur.courseBearingDeg)+" / "+angleLabel(cur.courseElevationDeg??0,{signed:true})+"."});
      }
    }
    if(prev.velocity!==cur.velocity){
      events.push({severity:"routine",type:"velocity_change",text:cur.id+" ha cambiado de velocidad: "+cur.velocity+"."});
    }
    if(prev.classification!==cur.classification){
      state.routineWatch.newUnknownIds=state.routineWatch.newUnknownIds.filter(id=>id!==cur.id);
      events.push({severity:"routine",type:"classification_change",text:cur.id+" ha sido reclasificado como "+cur.classification+"."});
    }
    const thresholds=[40,60,80];
    if(thresholds.some(t=>prev.confidence<t&&cur.confidence>=t)){
      events.push({severity:"routine",type:"confidence_crossing",text:cur.id+" supera un umbral de confianza: "+cur.confidence+"%."});
    }
  }

  for(const prev of previous.contacts){
    if(currentMap.has(prev.id))continue;
    const loss=nonDetectMap.get(prev.id)||{};
    const contact=getContact(state.sim,prev.id);
    const reason=loss.reason||contact?.sensorLossReason||contact?.lossReason||null;
    const highConfidence=Number(prev.confidence)>=60;
    const anomalous=highConfidence&&!loss.expected&&!reason;

    if(contact)contact.status="lost";

    if(anomalous){
      state.routineWatch.newUnknownIds=state.routineWatch.newUnknownIds.filter(id=>id!==prev.id);
      events.push({
        severity:"critical",
        type:"anomalous_contact_loss",
        text:"ALERTA: "+prev.id+" ha desaparecido súbitamente de la solución de sensores. Última confianza "+prev.confidence+"%. Última posición: distancia "+distanceLabel(prev.distanceKm)+", marcación "+angleLabel(prev.bearingDeg)+", elevación "+angleLabel(prev.elevationDeg,{signed:true})+". Último curso: "+(prev.courseBearingDeg!=null?angleLabel(prev.courseBearingDeg)+" / "+angleLabel(prev.courseElevationDeg??0,{signed:true}):"sin resolver")+". Velocidad: "+(prev.velocity||"sin resolver")+". Movimiento relativo: "+motionLabel(prev.relativeMotion)+". Máxima aproximación prevista: "+(prev.closestApproachKm!=null?distanceLabel(prev.closestApproachKm):"sin resolver")+". Causa no determinada."
      });
    }else if(loss.expected){
      const expectedMessages={
        out_of_range:prev.id+" ha salido del alcance pasivo de sensores.",
        known_interference:prev.id+" se ha perdido dentro de una zona de interferencia conocida.",
        occlusion:prev.id+" ha quedado oculto por una oclusión conocida.",
        warp_departure:prev.id+" ha entrado en curvatura. Contacto perdido por salida de seguimiento normal.",
        docked:prev.id+" ya no genera una solución independiente de sensores al quedar atracado.",
        landed:prev.id+" ya no genera una solución orbital independiente tras el aterrizaje.",
        scheduled_shutdown:prev.id+" ha dejado de emitir conforme al apagado previsto.",
        sensor_shadow:prev.id+" ha entrado en una sombra sensorial conocida."
      };
      events.push({
        severity:"routine",
        type:"expected_contact_loss",
        text:expectedMessages[reason]||("Contacto "+prev.id+" perdido por una causa sensorial conocida: "+reason+".")
      });
      log("ROUTINE WATCH · pérdida explicable "+prev.id+" · "+(reason||"sin detalle"));
    }else{
      events.push({
        severity:"warning",
        type:"contact_loss",
        text:"Contacto perdido: "+prev.id+". La Computer no dispone de una causa confirmada."
      });
    }
  }

  if(previous.sensors.arrayAvailable&&!current.sensors.arrayAvailable){
    events.push({severity:"critical",type:"array_failure",text:"La matriz de sensores activa ha dejado de estar disponible."});
  }
  if(previous.sensors.interference<=28&&current.sensors.interference>28){
    events.push({severity:"warning",type:"interference",text:"Interferencia de sensores fuera de tolerancia: "+current.sensors.interference+" puntos."});
  }

  state.routineWatch.baseline=current;
  state.routineWatch.lastCheck=new Date().toLocaleTimeString("es-ES",{hour12:false});
  state.routineWatch.checks++;

  if(events.length){
    const important=events.filter(e=>e.severity!=="routine");
    state.routineWatch.status=important.length?important.length+" alerta(s)":events.length+" novedad(es)";
    state.routineWatch.alertCount+=important.length;
    for(const event of events){
      const meta=event.type==="anomalous_contact_loss"
        ?"ALERTA · PÉRDIDA ANÓMALA"
        :event.type==="new_unknown_contact"
          ?"NUEVO CONTACTO · DESCONOCIDO"
          :event.type==="new_priority_contact"
            ?"ALERTA · CONTACTO PRIORITARIO"
            :"VIGILANCIA AUTOMÁTICA";
      addMessage("computer",event.text,meta);
      log("ROUTINE WATCH "+event.type+" · "+event.text);
    }
  }else{
    state.routineWatch.status=state.routineWatch.alertCount
      ?state.routineWatch.alertCount+" alerta(s) registrada(s)"
      :"Sin novedades";
  }
  render();
}

function checkWatchers(){
  for(const w of state.watchers){
    const c=getContact(state.sim,w.contactId);if(!c)continue;
    let triggered=false,msg="";
    if(w.condition==="contact_lost"&&c.status==="lost"&&w.baseline.status!=="lost"){triggered=true;msg=w.contactId+" se ha perdido de sensores."}
    if(w.condition==="course_change"){
      const spatial=contactSpatialSolution(c);
      if(spatial.courseBearingDeg!==w.baseline.courseBearingDeg||spatial.courseElevationDeg!==w.baseline.courseElevationDeg){
        triggered=true;msg=w.contactId+" ha cambiado de curso: "+courseLabel(c)+".";
      }
    }
    if(w.condition==="confidence_below"&&w.threshold!=null&&c.confidence<w.threshold&&w.baseline.confidence>=w.threshold){triggered=true;msg=w.contactId+" ha caído por debajo de "+w.threshold+"% de confianza."}
    if(triggered){addMessage("computer",msg,"ALERTA");log("WATCH ALERT "+msg);w.baseline={courseBearingDeg:contactSpatialSolution(c).courseBearingDeg,courseElevationDeg:contactSpatialSolution(c).courseElevationDeg,status:c.status,confidence:c.confidence}}
  }
}

function renderLog(){
  const box=$("#log-list");if(box)box.innerHTML=state.logs.map(x=>'<div class="log-entry">'+esc(x)+'</div>').join("");
}
function currentExerciseLogText(){
  const panel=$("#teacher-panel");
  const markerIndex=state.logs.findIndex(line=>line.includes("RESET scenario · teacher:"));
  if(markerIndex<0)return "";
  const lines=state.logs.slice(0,markerIndex+1).reverse();
  return ["=== HOLOCUBIERTA · LOG DE EJERCICIO ===","Práctica: "+(panel?.dataset.tutorialId||"—")+" · "+(panel?.dataset.tutorialTitle||"—"),"Nivel: "+(panel?.dataset.tutorialLevel||"—"),"Escenario: "+(panel?.dataset.scenarioId||state.sim?.scenarioId||"—"),"Exportado: "+new Date().toLocaleString("es-ES"),"----------------------------------------",...lines,"=== FIN LOG DE EJERCICIO ==="].join("\n");
}
async function copyExerciseLog(){
  const text=currentExerciseLogText(),status=$("#copy-log-status");if(!text){status.textContent="No hay ejercicio activo";return}
  try{await navigator.clipboard.writeText(text);status.textContent="✓ Log copiado";setTimeout(()=>status.textContent="",1800)}catch{status.textContent="No se pudo copiar"}
}

function setWorldTestIdle(){
  const select=$("#world-test-select"),button=$("#world-test-run");
  if(select)select.disabled=false;
  if(button){button.disabled=false;button.textContent="EJECUTAR PRUEBA";}
}

function beginWorldTest(label,seconds){
  const select=$("#world-test-select"),button=$("#world-test-run");
  if(select)select.disabled=true;
  let remaining=seconds;
  if(button){button.disabled=true;button.textContent="EN CURSO · "+remaining+" s";}
  const countdown=setInterval(()=>{
    remaining--;
    if(button&&remaining>0)button.textContent="EN CURSO · "+remaining+" s";
    if(remaining<=0){clearInterval(countdown)}
  },1000);
  state.worldTestTimers.push(countdown);
  log("WORLD TEST · "+label+" · cambio de World State previsto en "+seconds+" s");
}

function scheduleAnomalousLossTest(){
  if(!state.sim)return;
  let contact=state.sim.contacts.find(c=>c.id==="C-T03");
  if(!contact){
    contact={
      id:"C-T03",
      known:true,
      status:"identified",
      classification:"Crucero de ataque clase Vor'cha",
      kind:"starship",
      distanceKm:78000,
      confidence:92,
      signal:90,
      signatures:["transponder","warp","subspace","energy"],
      marked:false,
      vector:"316 / -04",
      bearingDeg:316,
      elevationDeg:-4,
      courseBearingDeg:142,
      courseElevationDeg:1,
      velocity:"0,17c",
      relativeMotion:"approaching",
      closestApproachKm:12400,
      tcpaMinutes:null,
      mass:"4,8 ×10⁶ t ±11%",
      dimensions:"481 × 341 × 106 m",
      lifeforms:"Lecturas compatibles con dotación numerosa",
      band:"Subespacio militar",
      energy:"Reactor materia/antimateria",
      subspace:"Firma warp klingon correlacionada",
      patternMatch:97,
      transponderRecognized:true,
      transponderLabel:"IKS Vornak",
      affiliation:"Imperio Klingon",
      military:true,
      operationalPriority:"high",
      worldPresent:true,
      sensorVisible:true,
      history:[],
      tracked:false,
      trackingMode:null,
      trackingPriority:"normal",
      lastObserved:null
    };
    state.sim.contacts.push(contact);
  }else{
    Object.assign(contact,{
      known:true,
      status:"identified",
      classification:"Crucero de ataque clase Vor'cha",
      distanceKm:78000,
      confidence:92,
      signal:90,
      vector:"316 / -04",
      bearingDeg:316,
      elevationDeg:-4,
      courseBearingDeg:142,
      courseElevationDeg:1,
      velocity:"0,17c",
      relativeMotion:"approaching",
      closestApproachKm:12400,
      tcpaMinutes:null,
      transponderRecognized:true,
      transponderLabel:"IKS Vornak",
      affiliation:"Imperio Klingon",
      military:true,
      operationalPriority:"high",
      worldPresent:true,
      sensorVisible:true
    });
  }
  delete contact.sensorLossReason;
  delete contact.lossReason;

  state.routineWatch.newUnknownIds=state.routineWatch.newUnknownIds.filter(id=>id!=="C-T03");
  syncRoutineWatchBaseline();
  render();
  beginWorldTest("1/8 · desaparición anómala de C-T03",12);

  const timer=setTimeout(()=>{
    const c=state.sim?.contacts?.find(x=>x.id==="C-T03");
    if(!c)return;
    c.sensorVisible=false;
    c.worldPresent=true;
    delete c.sensorLossReason;
    delete c.lossReason;
    log("WORLD STATE · C-T03 deja de ser detectable súbitamente · sin causa sensorial registrada");
    const button=$("#world-test-run");
    if(button)button.textContent="ESPERANDO CICLO DE SENSORES…";
    const release=setTimeout(()=>setWorldTestIdle(),6000);
    state.worldTestTimers.push(release);
  },12000);
  state.worldTestTimers.push(timer);
}

function scheduleWarpDepartureTest(){
  if(!state.sim)return;
  let contact=state.sim.contacts.find(c=>c.id==="C-T04");
  if(!contact){
    contact={
      id:"C-T04",
      known:true,
      status:"identified",
      classification:"Nave mercante de la Federación",
      kind:"starship",
      distanceKm:64000,
      confidence:95,
      signal:87,
      signatures:["transponder","warp","em"],
      marked:false,
      vector:"082 / +01",
      bearingDeg:82,
      elevationDeg:1,
      courseBearingDeg:96,
      courseElevationDeg:0,
      velocity:"0,09c",
      relativeMotion:"receding",
      closestApproachKm:58200,
      tcpaMinutes:null,
      mass:"3,1 ×10⁶ t ±9%",
      dimensions:"228 × 81 × 54 m",
      lifeforms:"96 compatibles",
      band:"2,4 THz",
      energy:"Patrón Federación estable",
      subspace:"Firma warp estable",
      patternMatch:98,
      transponderRecognized:true,
      transponderLabel:"SS Meridian · NAR-58217",
      affiliation:"Federación",
      military:false,
      operationalPriority:"normal",
      worldPresent:true,
      sensorVisible:true,
      history:[],
      tracked:false,
      trackingMode:null,
      trackingPriority:"normal",
      lastObserved:null
    };
    state.sim.contacts.push(contact);
  }else{
    Object.assign(contact,{
      known:true,status:"identified",distanceKm:64000,confidence:95,signal:87,
      vector:"082 / +01",bearingDeg:82,elevationDeg:1,courseBearingDeg:96,courseElevationDeg:0,
      velocity:"0,09c",relativeMotion:"receding",closestApproachKm:58200,tcpaMinutes:null,transponderRecognized:true,
      transponderLabel:"SS Meridian · NAR-58217",affiliation:"Federación",
      military:false,operationalPriority:"normal",worldPresent:true,sensorVisible:true
    });
  }
  delete contact.lossReason;
  delete contact.sensorLossReason;
  syncRoutineWatchBaseline();
  render();
  beginWorldTest("2/8 · salida normal a curvatura de C-T04",12);

  const timer=setTimeout(()=>{
    const c=state.sim?.contacts?.find(x=>x.id==="C-T04");
    if(!c)return;
    c.velocity="warp 2,1";
    c.subspace="Transición a curvatura confirmada";
    c.lossReason="warp_departure";
    c.sensorLossReason="warp_departure";
    c.sensorVisible=false;
    c.worldPresent=true;
    log("WORLD STATE · C-T04 entra en curvatura · pérdida esperada warp_departure");
    const button=$("#world-test-run");
    if(button)button.textContent="ESPERANDO CICLO DE SENSORES…";
    const release=setTimeout(()=>setWorldTestIdle(),6000);
    state.worldTestTimers.push(release);
  },12000);
  state.worldTestTimers.push(timer);
}

function launchWorldTest(){
  const selected=$("#world-test-select")?.value;
  if(selected==="known")return scheduleKnownLongRangeContactTest();
  if(selected==="unknown")return scheduleUnknownLongRangeContactTest();
  if(selected==="klingon")return scheduleKlingonLongRangeContactTest();
  if(selected==="anomalous-loss")return scheduleAnomalousLossTest();
  if(selected==="warp-departure")return scheduleWarpDepartureTest();
}

function scheduleKnownLongRangeContactTest(){
  if(!state.sim)return;
  const existing=state.sim.contacts.find(c=>c.id==="C-T01");
  if(existing){
    state.sim.contacts=state.sim.contacts.filter(c=>c.id!=="C-T01");
  }

  const testContact={
    id:"C-T01",
    known:false,
    status:"unidentified",
    classification:"Nave científica de la Federación",
    kind:"starship",
    distanceKm:145000,
    confidence:34,
    signal:74,
    signatures:["transponder","warp","em"],
    marked:false,
    vector:"203 / -02",
    bearingDeg:203,
    elevationDeg:-2,
    courseBearingDeg:221,
    courseElevationDeg:0,
    velocity:"0,08c",
    relativeMotion:"crossing",
    closestApproachKm:73500,
    tcpaMinutes:null,
    mass:"2,4 ×10⁶ t ±10%",
    dimensions:"165 × 74 × 41 m",
    lifeforms:"142 compatibles",
    band:"2,8 THz",
    energy:"Patrón Federación estable",
    subspace:"Warp estable",
    patternMatch:94,
    transponderRecognized:true,
    transponderLabel:"USS Venture · NCC-71854",
    worldPresent:true,
    sensorVisible:true
  };
  state.sim.contacts.push(testContact);
  syncRoutineWatchBaseline();

  beginWorldTest("contacto conocido C-T01",15);
  log("WORLD TEST · C-T01 creado fuera de alcance a 145000 km");

  const timer=setTimeout(()=>{
    const c=state.sim?.contacts?.find(x=>x.id==="C-T01");
    if(!c)return;
    c.distanceKm=94000;
    c.signal=76;
    c.vector="201 / -02";
    c.bearingDeg=201;
    c.elevationDeg=-2;
    c.courseBearingDeg=221;
    c.courseElevationDeg=0;
    c.relativeMotion="crossing";
    c.closestApproachKm=73500;
    c.velocity="0,09c";
    log("WORLD STATE · C-T01 entra en largo alcance a 94000 km");
    setWorldTestIdle();
  },15000);
  state.worldTestTimers.push(timer);
}

function scheduleUnknownLongRangeContactTest(){
  if(!state.sim)return;
  const existing=state.sim.contacts.find(c=>c.id==="C-T02");
  if(existing){
    state.sim.contacts=state.sim.contacts.filter(c=>c.id!=="C-T02");
  }

  const testContact={
    id:"C-T02",
    known:false,
    status:"unidentified",
    classification:"No identificado",
    kind:"unknown",
    distanceKm:138000,
    confidence:18,
    signal:70,
    signatures:["subspace","energy"],
    marked:false,
    vector:"147 / +05",
    bearingDeg:147,
    elevationDeg:5,
    courseBearingDeg:null,
    courseElevationDeg:null,
    velocity:"0,12c ±0,03c",
    relativeMotion:"unknown",
    closestApproachKm:null,
    tcpaMinutes:null,
    mass:"Sin resolver",
    dimensions:"Sin resolver",
    lifeforms:"No concluyente",
    band:"4,4 THz / subespacio",
    energy:"Intermitente",
    subspace:"Firma parcial no correlacionada",
    patternMatch:26,
    transponderRecognized:false,
    worldPresent:true,
    sensorVisible:true
  };
  state.sim.contacts.push(testContact);
  syncRoutineWatchBaseline();

  beginWorldTest("contacto desconocido C-T02",15);
  log("WORLD TEST · C-T02 creado fuera de alcance a 138000 km");

  const timer=setTimeout(()=>{
    const c=state.sim?.contacts?.find(x=>x.id==="C-T02");
    if(!c)return;
    c.distanceKm=91000;
    c.signal=73;
    c.vector="145 / +05";
    c.bearingDeg=145;
    c.elevationDeg=5;
    c.velocity="0,13c ±0,03c";
    log("WORLD STATE · C-T02 entra en largo alcance a 91000 km sin identificación");
    setWorldTestIdle();
  },15000);
  state.worldTestTimers.push(timer);
}

function scheduleKlingonLongRangeContactTest(){
  if(!state.sim)return;
  const existing=state.sim.contacts.find(c=>c.id==="C-T03");
  if(existing){
    state.sim.contacts=state.sim.contacts.filter(c=>c.id!=="C-T03");
  }

  const testContact={
    id:"C-T03",
    known:false,
    status:"unidentified",
    classification:"Crucero de ataque clase Vor'cha",
    kind:"starship",
    distanceKm:152000,
    confidence:36,
    signal:82,
    signatures:["transponder","warp","subspace","energy"],
    marked:false,
    vector:"318 / -04",
    velocity:"0,16c",
    mass:"4,8 ×10⁶ t ±11%",
    dimensions:"481 × 341 × 106 m",
    lifeforms:"Lecturas compatibles con dotación numerosa",
    band:"Subespacio militar",
    energy:"Reactor materia/antimateria",
    subspace:"Firma warp klingon correlacionada",
    patternMatch:97,
    transponderRecognized:true,
    transponderLabel:"IKS Vornak",
    affiliation:"Imperio Klingon",
    military:true,
    operationalPriority:"high",
    worldPresent:true,
    sensorVisible:true
  };
  state.sim.contacts.push(testContact);
  syncRoutineWatchBaseline();

  beginWorldTest("nave klingon prioritaria C-T03",15);
  log("WORLD TEST · C-T03 nave klingon fuera de alcance a 152000 km");

  const timer=setTimeout(()=>{
    const c=state.sim?.contacts?.find(x=>x.id==="C-T03");
    if(!c)return;
    c.distanceKm=96500;
    c.signal=84;
    c.vector="316 / -04";
    c.bearingDeg=316;
    c.elevationDeg=-4;
    c.courseBearingDeg=142;
    c.courseElevationDeg=1;
    c.relativeMotion="approaching";
    c.closestApproachKm=12400;
    c.velocity="0,17c";
    log("WORLD STATE · C-T03 entra en largo alcance · transpondedor klingon reconocido");
    setWorldTestIdle();
  },15000);
  state.worldTestTimers.push(timer);
}

function bind(){
  $("#scenario-select").onchange=()=>{if($("#mode-select").value==="free")resetScenario("free:scenario-select",$("#scenario-select").value)};
  $("#computer-select").onchange=()=>{state.profileId=$("#computer-select").value;addMessage("system","Computadora activa: "+profile().name);log("COMPUTER PROFILE "+state.profileId);render()};
  $("#model-route-select").onchange=()=>{state.routingMode=$("#model-route-select").value;localStorage.setItem("sensorAI.routingMode",state.routingMode);addMessage("system","Ruta Gemini: "+($("#model-route-select").selectedOptions[0]?.textContent||state.routingMode));log("MODEL ROUTE "+state.routingMode);render()};
  $("#reset-sim").onclick=()=>resetScenario("manual",state.sim.scenarioId);
  $("#send-command").onclick=()=>{const el=$("#command-input"),v=el.value;el.value="";submitCommand(v,"text")};
  $("#command-input").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){const v=e.currentTarget.value;e.currentTarget.value="";submitCommand(v,"text")}});
  $("#toggle-log").onclick=()=>{$("#log-panel").hidden=!$("#log-panel").hidden};
  $("#world-test-run").onclick=launchWorldTest;
  $("#copy-exercise-log").onclick=copyExerciseLog;
}
async function load(){
  state.scenarios=await fetch("../sensors/data/scenarios.json").then(r=>r.json());
  state.sim=createSimulation(state.scenarios.scenarios[0]);
  state.selectedContactId=state.sim.selectedContactId;
  $("#scenario-select").innerHTML=state.scenarios.scenarios.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
  $("#scenario-select").value=state.sim.scenarioId;
  $("#computer-select").value=state.profileId;
  state.routingMode=localStorage.getItem("sensorAI.routingMode")||"auto";
  $("#model-route-select").value=state.routingMode;
  bind();
  const voice=createVoiceController({
    onTranscript:(text,isFinal)=>{
      $("#command-input").value=text;
      if(isFinal&&text){$("#voice-status").textContent="Orden de voz recibida";setTimeout(()=>{const v=$("#command-input").value;$("#command-input").value="";submitCommand(v,"voice")},220)}
    },
    onStatus:(text,listening)=>{$("#voice-status").textContent=text;$("#voice-button").classList.toggle("listening",!!listening);$("#voice-button").textContent=listening?"■ Escuchando":"🎙 Voz"}
  });
  $("#voice-button").onclick=()=>voice.start();
  addMessage("computer","Computadora de Sensores disponible. Vigilancia pasiva automática 24/7 de corto y largo alcance activa. Puede dar una orden por texto o por voz.");
  syncRoutineWatchBaseline();
  render();
  initTeacherMode({resetScenario,logTeacher:teacherLog});
  setInterval(checkWatchers,1200);
  setInterval(routineWatchTick,5000);
  log("SIMULATOR READY · sensors v0.2 · "+state.sim.scenarioTitle);
}
load().catch(e=>{document.body.innerHTML='<pre style="padding:30px;color:#8a2f2f">Error cargando Sensores v0.2: '+esc(e.message)+'</pre>';console.error(e)});
