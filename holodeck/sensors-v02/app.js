import { initTeacherMode, emitTeacherEvent } from "./teacher_mode.js";
import {
  createSimulation,knownContacts,getContact,getArray,trackingUsed,effectivePenalty,
  createOperation,operationDuration,resolveScan,resolveSearch,startTracking,stopTracking,
  updateTracking,readout,applyInterference,applyConfig,restoreStandard,loadProfile,saveProfile,
  deleteProfile,runDiagnostic,calibrateArray,requestEngineering,makePowerResponse,transferData,
  saveReading,compareReadings,severityLabel
} from "./sim_engine.js";

const shell={
  model:null,context:null,interaction:null,powerContract:null,scenarios:null,
  sim:null,primaryId:"status",secondaryId:"general_status",special:null,prefill:null,
  logs:[],timers:new Set(),selectedArrayId:null,selectedResultId:null,message:null
};
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function log(msg){const t=new Date().toLocaleTimeString("es-ES",{hour12:false});shell.logs.unshift(t+"  "+msg);renderLog()}
function teacherLog(msg){log("INSTRUCTOR · "+msg)}
function notify(text,type="notice"){shell.message={text,type};renderWorkspace()}
function actionDef(id){return shell.context?.actions?.[id]||{display_es:id.replaceAll("_"," ")}}
function contact(){return getContact(shell.sim)}
function primary(){return shell.model.root.find(x=>x.id===shell.primaryId)}
function secondary(){return primary()?.secondary?.find(x=>x.id===shell.secondaryId)}
function scenarioById(id){return shell.scenarios.scenarios.find(x=>x.id===id)||shell.scenarios.scenarios[0]}
function clearTimers(){for(const t of shell.timers)clearInterval(t);shell.timers.clear()}
async function load(){
  const [m,c,i,p,s]=await Promise.all([
    fetch("../sensors/data/sensor_menu_tree.json").then(r=>r.json()),
    fetch("../sensors/data/sensor_context_actions.json").then(r=>r.json()),
    fetch("../sensors/data/sensor_console_interaction_model.json").then(r=>r.json()),
    fetch("../sensors/data/sensor_to_operations_power_request.json").then(r=>r.json()),
    fetch("../sensors/data/scenarios.json").then(r=>r.json())
  ]);
  shell.model=m;shell.context=c;shell.interaction=i;shell.powerContract=p;shell.scenarios=s;const rn=shell.model.root.find(x=>x.id==="results");if(rn)rn.display_es="Resultados e historial";
  shell.sim=createSimulation(s.scenarios[0]);
  const scenarioSelect=$("#scenario-select");
  scenarioSelect.innerHTML=s.scenarios.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
  scenarioSelect.value=shell.sim.scenarioId;
  bind();render();syncScenarioControl();log("SIMULATOR READY · "+shell.sim.scenarioTitle);
  initTeacherMode({resetScenario,logTeacher:teacherLog});
  window.dispatchEvent(new CustomEvent("sensors-ready-v02"));
}
function bind(){
  $("#reset-sim").addEventListener("click",()=>resetScenario("manual",shell.sim.scenarioId));
  $("#toggle-log").addEventListener("click",()=>{$("#log-panel").hidden=!$("#log-panel").hidden});
  $("#copy-exercise-log").addEventListener("click",copyCurrentExerciseLog);
  $("#scenario-select").addEventListener("change",()=>{if($("#mode-select").value==="free")resetScenario("free:scenario-select",$("#scenario-select").value)});
  $("#mode-select").addEventListener("change",syncScenarioControl);
}
function syncScenarioControl(){
  const select=$("#scenario-select");if(!select)return;
  select.disabled=$("#mode-select").value==="teacher";
  select.title=select.disabled?"El escenario lo determina la práctica del profesor.":"Selecciona un escenario para el Modo Libre.";
}
function resetScenario(source="manual",scenarioId=null){
  clearTimers();
  const scenario=scenarioById(scenarioId||shell.sim?.scenarioId||shell.scenarios.scenarios[0].id);
  shell.sim=createSimulation(scenario);
  if($("#scenario-select"))$("#scenario-select").value=scenario.id;
  shell.primaryId="status";shell.secondaryId="general_status";shell.special=null;shell.prefill=null;
  shell.selectedArrayId=shell.sim.activeArray;shell.selectedResultId=null;shell.message=null;
  log("RESET scenario · "+source+" · "+scenario.id);render();
  emitTeacherEvent("SCENARIO_RESET",{source,scenarioId:scenario.id});
}
function navPrimary(id){
  shell.primaryId=id;shell.special=null;shell.prefill=null;
  shell.secondaryId=shell.model.root.find(x=>x.id===id)?.secondary?.[0]?.id||null;
  if(id==="results"&&shell.sim.operations.every(o=>o.state!=="running")&&shell.sim.results.length)shell.secondaryId="recent_results";
  log("OPEN "+id);emitTeacherEvent("NAV_PRIMARY",{primaryId:id});render();
}
function navSecondary(id){
  shell.secondaryId=id;shell.special=null;shell.prefill=null;
  log("OPEN "+shell.primaryId+"/"+id);emitTeacherEvent("NAV_SECONDARY",{primaryId:shell.primaryId,secondaryId:id});render();
}
function render(){renderPrimary();renderSecondary();renderWorkspace();renderStatus();renderLog()}
function renderPrimary(){
  $("#primary-nav").innerHTML=shell.model.root.map(x=>'<button class="primary-button '+(x.id===shell.primaryId?"active":"")+'" data-p="'+x.id+'">'+esc(x.display_es)+'</button>').join("");
  document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>navPrimary(b.dataset.p));
}
function renderSecondary(){
  const p=primary();$("#workspace-kicker").textContent="SENSORES · "+(p?.display_es||"");
  $("#workspace-title").textContent=p?.display_es||"Sensores";
  const list=p?.secondary||[];
  $("#secondary-nav").innerHTML=list.map(x=>'<button class="secondary-button '+(x.id===shell.secondaryId?"active":"")+'" data-s="'+x.id+'">'+esc(x.display_es)+'</button>').join("");
  document.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>navSecondary(b.dataset.s));
}
function datum(k,v){return '<div class="datum"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>'}
function button(id,cls=""){return '<button class="action '+cls+'" data-action="'+id+'">'+esc(actionDef(id).display_es)+'</button>'}
function taskButton(id,label,cls=""){return '<button class="action '+cls+'" data-task="'+id+'">'+esc(label)+'</button>'}
function operationLabel(r){
  const primaryId=r?.type==="search"?"search_localize":r?.type==="scan"?"scans":null;
  const display=primaryId?shell.model?.root?.find(x=>x.id===primaryId)?.secondary?.find(x=>x.id===r.subtype)?.display_es:null;
  if(r?.type==="search")return "Búsqueda de "+String(display||r.subtype||"objetivo").toLocaleLowerCase("es-ES");
  if(r?.type==="scan")return "Barrido "+String(display||r.subtype||"sensorial").toLocaleLowerCase("es-ES");
  return String(r?.type||"Operación");
}
function humanTarget(value){
  const map={sector_041:"Sector 041",sector_014:"Sector 014",local:"Espacio local",system:"Sistema estelar",wide:"Volumen ampliado",surrounding:"Espacio circundante",coordinates:"Coordenadas definidas",vector:"Vector definido",defined_zone:"Zona definida"};
  return map[value]||value||"—";
}
function resultSubject(r){
  const direct=r?.configuration?.contactId;
  if(direct)return "Contacto "+direct;
  const ids=(r?.observations||[]).filter(o=>!o.falsePositive&&getContact(shell.sim,o.id)).map(o=>o.id);
  if(ids.length===1)return "Contacto "+ids[0];
  if(ids.length>1)return "Contactos: "+ids.join(" · ");
  const target=humanTarget(r?.target);
  return target!=="—"?target:"Sin contacto asociado";
}
function fieldSelect(id,label,opts,value=""){return '<div class="field"><label>'+esc(label)+'</label><select id="'+id+'">'+opts.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(value)?"selected":"")+'>'+esc(t)+'</option>').join("")+'</select></div>'}
function fieldMultiSelect(id,label,opts,values=[]){const set=new Set(Array.isArray(values)?values:[values]);return '<div class="field"><label>'+esc(label)+'</label><select id="'+id+'" multiple size="5">'+opts.map(([v,t])=>'<option value="'+esc(v)+'" '+(set.has(v)?"selected":"")+'>'+esc(t)+'</option>').join("")+'</select><small class="field-help">Ctrl/Cmd + clic para combinar filtros</small></div>'}
function fieldInput(id,label,value="",placeholder=""){return '<div class="field"><label>'+esc(label)+'</label><input id="'+id+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'"></div>'}
function messageHtml(){if(!shell.message)return "";const m=shell.message;shell.message=null;return '<div class="'+(m.type==="danger"?"danger-note":m.type==="success"?"notice success":"notice")+'">'+esc(m.text)+'</div>'}
function wireCommon(){
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>doAction(b.dataset.action));
  document.querySelectorAll("[data-task]").forEach(b=>b.onclick=()=>doTask(b.dataset.task,b));
}
function renderWorkspace(){
  const box=$("#workspace-content"),msg=messageHtml();
  let html="";
  if(shell.special==="power_request")html=powerRequestView();
  else if(shell.special==="handoff")html=handoffView();
  else switch(shell.primaryId){
    case "status":html=statusView();break;
    case "scans":html=scanView();break;
    case "search_localize":html=searchView();break;
    case "contacts":html=contactsView();break;
    case "tracking":html=trackingView();break;
    case "sensor_readout":html=readoutView();break;
    case "interference":html=interferenceView();break;
    case "configuration":html=configurationView();break;
    case "results":html=resultsView();break;
    case "diagnostics":html=diagnosticsView();break;
    default:html='<div class="notice">Función no disponible.</div>';
  }
  box.innerHTML=msg+html;wireCommon();wireSpecific();
}
function statusView(){
  const s=secondary(),sim=shell.sim,a=getArray(sim),known=knownContacts(sim);
  if(!s)return "";
  if(s.id==="general_status")return '<div class="card"><h3>Estado general</h3><div class="data-grid">'+datum("Sistema",sim.diagnostics[0]?.status||"NOMINAL")+datum("Escenario",sim.scenarioTitle)+datum("Matriz activa",a?.name||"—")+datum("Potencia",sim.power+" %")+datum("Contactos conocidos",known.length)+datum("Interferencia",severityLabel(sim.interference.severity))+'</div></div>';
  if(s.id==="available_arrays")return '<div class="card"><h3>Matrices disponibles</h3><div class="contact-list">'+sim.arrays.map(x=>'<div class="contact-row '+(x.id===sim.activeArray?"active":"")+'" data-array="'+x.id+'"><strong>'+esc(x.id)+'</strong><span>'+esc(x.name)+'<br><small>Integridad '+x.integrity+'% · Calibración '+x.calibration+'%</small></span><strong>'+(x.available?"DISP.":"NO")+'</strong></div>').join("")+'</div></div>'+arrayDetail();
  if(s.id==="effective_range"){const range=Math.round((a?.range||0)*(sim.power/72)*(1-effectivePenalty(sim)/160));return '<div class="card"><h3>Alcance efectivo</h3><div class="data-grid">'+datum("Índice de alcance",range+" %")+datum("Matriz",a?.name)+datum("Penalización",effectivePenalty(sim)+" pts")+datum("Potencia",sim.power+" %")+'</div><div class="action-grid">'+button("open_configuration_power")+button("request_additional_power","secondary")+'</div></div>'}
  if(s.id==="available_resolution"){const res=Math.round((a?.resolution||0)*(1-effectivePenalty(sim)/180));return '<div class="card"><h3>Resolución disponible</h3><div class="data-grid">'+datum("Índice de resolución",res+" %")+datum("Calibración",a?.calibration+" %")+datum("Configuración",sim.config.defaultResolution)+datum("Interferencia",severityLabel(sim.interference.severity))+'</div><div class="action-grid">'+button("open_configuration_resolution")+button("request_additional_power","secondary")+'</div></div>'}
  if(s.id==="allocated_power")return '<div class="card"><h3>Potencia asignada</h3><div class="data-grid">'+datum("Asignación actual",sim.power+" %")+datum("Potencia operación",sim.config.operationPower+" % de asignada")+datum("Margen OPS del escenario",sim.powerBudget+" pts")+datum("Solicitud",sim.powerRequest?.state||"NINGUNA")+'</div><div class="action-grid">'+button("open_configuration_power")+button("request_additional_power","secondary")+(sim.powerRequest?.state==="PENDIENTE"?button("cancel_power_request","secondary"):"")+'</div></div>';
  if(s.id==="integrity_damage")return '<div class="card"><h3>Integridad / daños</h3><div class="data-grid">'+sim.arrays.map(x=>datum(x.name,x.integrity+" % · "+(x.error||"sin código de fallo"))).join("")+'</div><div class="action-grid">'+button("open_diagnostics")+button("request_engineering_support","secondary")+'</div></div>';
  if(s.id==="detected_interference")return interferenceSummary();
  if(s.id==="active_operations")return '<div class="card"><h3>Operaciones activas</h3>'+activeOpsHtml()+'</div>';
  return "";
}
function arrayDetail(){
  const a=shell.sim.arrays.find(x=>x.id===(shell.selectedArrayId||shell.sim.activeArray));if(!a)return "";
  return '<div class="card"><h3>'+esc(a.name)+'</h3><div class="data-grid">'+datum("Disponibilidad",a.available?"DISPONIBLE":"NO DISPONIBLE")+datum("Integridad",a.integrity+" %")+datum("Calibración",a.calibration+" %")+datum("Bandas",a.bands.join(" · "))+datum("Alcance nominal",a.range+" %")+datum("Resolución nominal",a.resolution+" %")+'</div><div class="action-grid">'+button("select_array")+button("calibrate_array","secondary")+button("run_array_diagnostic","secondary")+button("request_engineering_support","secondary")+'</div></div>';
}
function scanView(){
  const s=secondary(),sim=shell.sim,c=contact();if(!s)return "";
  const focused=s.id==="focused";
  const pf=shell.prefill||{};
  const area=focused?[[c?.id||"","Contacto "+(c?.id||"")]]:[["surrounding","Espacio circundante"],["sector_041","Sector 041"],["sector_014","Sector 014"],["system","Sistema estelar"],["coordinates","Coordenadas 12.4 / 8.1 / -3.0"],["vector","Vector 031 / +12"],["defined_zone","Zona definida A-3"]];
  return '<div class="card"><h3>'+esc(s.display_es)+'</h3><p>La configuración se ejecutará aunque sea una mala decisión operativa, siempre que sea físicamente posible.</p><div class="form-grid">'+
    fieldSelect("scan-mode","Modo",[["passive","Pasivo"],["active","Activo"]],pf.mode||"passive")+
    fieldSelect("target-scope","Área / objetivo",area,focused?(c?.id||""):(pf.targetValue||"surrounding"))+
    fieldSelect("resolution","Resolución",[["general","General"],["standard","Estándar"],["high","Alta"]],pf.resolution||sim.config.defaultResolution)+
    fieldSelect("priority","Prioridad",[["none","Ninguna"],["subspace","Subespacio"],["warp","Warp"],["em","Electromagnética"],["gravimetric","Gravimétrica"],["thermal","Térmica"],["ionizing_radiation","Radiación ionizante"],["particle","Partículas"],["biological","Biológica"],["transponder","Transpondedor"]],pf.priority||sim.config.defaultPriority)+
    fieldSelect("duration","Duración",[["quick","Rápida"],["standard","Estándar"],["extended","Extendida"],["custom","Personalizada"]],pf.duration||"standard")+
    fieldMultiSelect("filters","Filtros",[["all","Todas las firmas"],["em","Electromagnética"],["subspace","Subespacial"],["gravimetric","Gravimétrica"],["thermal","Térmica"],["ionizing_radiation","Radiación ionizante"],["particle","Partículas"],["biological","Biológica"],["warp","Firma warp"],["transponder","Transpondedor artificial"]],pf.filters||sim.config.defaultFilters||["all"])+
    '</div><div class="action-grid">'+taskButton("review_scan_configuration","Revisar configuración","secondary")+taskButton("execute_scan","Ejecutar barrido")+taskButton("restore_operation_defaults","Restaurar valores","secondary")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
}
function searchView(){
  const s=secondary(),pf=shell.prefill||{};if(!s)return "";
  return '<div class="card"><h3>'+esc(s.display_es)+'</h3><p>Búsqueda intenta localizar candidatos compatibles con lo que buscas; no garantiza identificación.</p><div class="form-grid">'+
    fieldSelect("search-area","Área",[["local","Espacio local"],["sector_041","Sector 041"],["sector_014","Sector 014"],["system","Sistema estelar"],["coordinates","Coordenadas definidas"],["wide","Volumen ampliado"]],pf.area||"sector_041")+
    fieldSelect("search-sensitivity","Sensibilidad",[["low","Baja"],["standard","Estándar"],["high","Alta"],["maximum","Máxima"]],pf.sensitivity||shell.sim.config.sensitivity)+
    fieldSelect("search-resolution","Resolución",[["general","General"],["standard","Estándar"],["high","Alta"]],pf.resolution||shell.sim.config.defaultResolution)+
    fieldInput("search-criteria","Criterio adicional",pf.criteria||"",s.id==="custom_signature"?"p. ej. subspace, transponder…":"Opcional")+
    '</div><div class="action-grid">'+taskButton("start_search","Iniciar búsqueda")+taskButton("clear_search_criteria","Limpiar criterio","secondary")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>'+latestResultMini("search");
}
function contactsView(){
  const s=secondary();let list=knownContacts(shell.sim);
  if(s?.id==="unidentified")list=list.filter(c=>c.status==="unidentified");
  if(s?.id==="identified")list=list.filter(c=>c.status==="identified");
  if(s?.id==="marked")list=list.filter(c=>c.marked);
  if(s?.id==="recently_lost")list=list.filter(c=>c.status==="lost");
  const c=contact();
  let h='<div class="card"><h3>'+esc(s.display_es)+'</h3><div class="contact-list">'+list.map(x=>'<div class="contact-row '+(x.id===shell.sim.selectedContactId?"active":"")+'" data-contact="'+x.id+'"><strong>'+x.id+'</strong><span>'+esc(x.classification)+'<br><small>'+esc((x.signatures||[]).join(" · "))+'</small></span><strong>'+x.confidence+'%</strong></div>').join("")+'</div></div>';
  if(c&&list.some(x=>x.id===c.id))h+='<div class="card"><h3>Ficha · '+c.id+'</h3><div class="data-grid">'+datum("Clasificación",c.classification)+datum("Distancia",c.distanceKm.toLocaleString("es-ES")+" km")+datum("Vector",c.vector)+datum("Velocidad",c.velocity)+datum("Firmas",(c.signatures||[]).join(" · "))+datum("Confianza",Math.round(c.confidence)+" %")+datum("Estado",c.status.toUpperCase())+datum("Seguimiento",c.tracked?(c.trackingMode||"normal").toUpperCase():"NO")+'</div><div class="action-grid">'+contactActions(c).map(a=>button(a)).join("")+'</div></div>';
  return h;
}
function contactActions(c){
  if(c.status==="lost")return ["reacquire_contact","predict_trajectory","compare_readings","open_sensor_readout","request_additional_power"];
  const a=["focused_scan","open_sensor_readout","compare_readings","send_to_science"];
  a.push(c.tracked?"stop_tracking":"start_tracking");
  if(c.tracked)a.push(c.trackingPriority==="priority"?"set_normal_tracking":"set_priority_tracking");
  a.push(c.marked?"unmark_contact":"mark_contact");
  if(c.confidence<60)a.push("high_resolution_scan","request_additional_power");
  return a;
}
function trackingView(){
  const s=secondary(),sim=shell.sim,c=contact(),known=knownContacts(sim);
  const contactOpts=known.map(x=>[x.id,x.id+" · "+x.classification]);
  if(s.id==="tracked_contacts"){
    const rows=sim.tracking.assignments.map(a=>{const x=getContact(sim,a.contactId);return '<div class="contact-row" data-contact="'+x.id+'"><strong>'+x.id+'</strong><span>'+esc(x.classification)+'<br><small>'+a.mode+' · '+a.priority+'</small></span><strong>'+a.quality+'%</strong></div>'}).join("");
    return '<div class="card"><h3>Contactos seguidos</h3><p>Capacidad '+trackingUsed(sim)+' / '+sim.tracking.capacity+'</p><div class="contact-list">'+(rows||'<div class="notice">Sin seguimientos activos.</div>')+'</div></div>';
  }
  if(s.id==="acquire_contact")return '<div class="card"><h3>Fijar contacto</h3><div class="form-grid">'+fieldSelect("track-contact","Contacto",contactOpts,c?.id)+fieldSelect("track-mode","Modo",[["normal","Normal"],["signature","Firma concreta"]],"normal")+fieldSelect("track-priority","Prioridad",[["normal","Normal"],["priority","Prioritario"]],"normal")+'</div><div class="action-grid">'+taskButton("start_tracking_form","Iniciar seguimiento")+'</div></div>';
  if(s.id==="multi_track"){
    const rows=known.map(x=>{const a=sim.tracking.assignments.find(v=>v.contactId===x.id),value=!a?"off":a.priority==="priority"?"priority":"normal";return '<div class="contact-row"><strong>'+x.id+'</strong><span>'+esc(x.classification)+'</span><span><select class="tracking-plan" data-plan-contact="'+x.id+'"><option value="off" '+(value==="off"?"selected":"")+'>Sin seguimiento</option><option value="normal" '+(value==="normal"?"selected":"")+'>Normal</option><option value="priority" '+(value==="priority"?"selected":"")+'>Prioritario</option></select></span></div>'}).join("");
    return '<div class="card"><h3>Seguimiento múltiple</h3><div class="data-grid">'+datum("Capacidad usada",trackingUsed(sim)+" / "+sim.tracking.capacity)+datum("Potencia",sim.power+" %")+'</div><div class="contact-list">'+rows+'</div><div class="action-grid">'+taskButton("apply_tracking_priorities","Aplicar prioridades")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  }
  if(s.id==="track_signature")return '<div class="card"><h3>Seguir firma concreta</h3><div class="form-grid">'+fieldSelect("sig-contact","Contacto",contactOpts,c?.id)+fieldSelect("sig-type","Firma",[["subspace","Subespacial"],["warp","Warp"],["em","Electromagnética"],["thermal","Térmica"],["transponder","Transpondedor"]],"subspace")+'</div><div class="action-grid">'+taskButton("start_signature_tracking","Iniciar seguimiento de firma")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(["update_position","estimate_course","estimate_velocity"].includes(s.id)){const actionId={update_position:"execute_position_update",estimate_course:"execute_course_estimation",estimate_velocity:"execute_velocity_estimation"}[s.id];return '<div class="card"><h3>'+esc(s.display_es)+'</h3><div class="form-grid">'+fieldSelect("track-op-contact","Contacto",contactOpts,c?.id)+fieldSelect("observation-window","Ventana de observación",[["short","Corta"],["standard","Estándar"],["extended","Extendida"]],"standard")+'</div><div class="action-grid">'+taskButton(actionId,s.display_es)+taskButton("cancel","Cancelar","secondary")+'</div></div>'}
  if(s.id==="predict_trajectory")return '<div class="card"><h3>Predecir trayectoria</h3><div class="form-grid">'+fieldSelect("track-op-contact","Contacto",contactOpts,c?.id)+fieldSelect("prediction-horizon","Horizonte",[["5 min","5 min"],["15 min","15 min"],["30 min","30 min"]],"5 min")+'</div><div class="action-grid">'+taskButton("execute_trajectory_prediction","Calcular predicción")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="reacquire_lost_contact"){
    const lost=known.filter(x=>x.status==="lost").map(x=>[x.id,x.id+" · última "+x.distanceKm.toLocaleString("es-ES")+" km"]);
    return '<div class="card"><h3>Recuperar contacto perdido</h3><div class="form-grid">'+fieldSelect("lost-contact","Contacto perdido",lost,lost[0]?.[0]||"")+fieldSelect("search-window","Ventana de búsqueda",[["narrow","Estrecha"],["standard","Estándar"],["wide","Amplia"]],"standard")+'</div><div class="action-grid">'+taskButton("start_reacquisition","Iniciar recuperación")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  }
  return "";
}
function readoutView(){
  const s=secondary(),c=contact();if(!s||!c)return '<div class="notice">Seleccione primero un contacto.</div>';
  const r=readout(shell.sim,c.id,s.id);
  return '<div class="card"><h3>'+esc(s.display_es)+' · '+c.id+'</h3><div class="data-grid">'+datum("Valor",r.value)+datum("Incertidumbre",r.uncertainty)+datum("Confianza",r.confidence+" %")+datum("Momento",r.timestamp)+datum("Procedencia",r.provenance)+datum("Historial",r.history.length+" observaciones")+'</div><div class="action-grid">'+button("focused_scan")+button("compare_readings","secondary")+button("send_to_science","secondary")+button("save_reading","secondary")+(c.confidence<60?button("request_additional_power","secondary"):"")+'</div></div>';
}
function interferenceSummary(){
  const i=shell.sim.interference;
  return '<div class="card"><h3>Interferencias detectadas</h3><div class="data-grid">'+datum("Severidad",severityLabel(i.severity))+datum("Tipo",i.type)+datum("Origen observable",i.source)+datum("Banda afectada",i.band)+datum("Penalización efectiva",effectivePenalty(shell.sim)+" pts")+datum("Compensación",i.compensation.toUpperCase())+'</div><div class="action-grid">'+button("automatic_compensation")+button("manual_compensation","secondary")+button("send_to_science","secondary")+button("send_to_tactical","secondary")+'</div></div>';
}
function interferenceView(){
  const s=secondary(),sim=shell.sim,i=sim.interference;
  if(["interference_status","interference_type"].includes(s.id))return interferenceSummary();
  if(s.id==="automatic_compensation")return '<div class="card"><h3>Compensación automática</h3><p>El sistema aplicará un ajuste seguro y rápido. Puede no ser la solución óptima.</p><div class="data-grid">'+datum("Penalización actual",effectivePenalty(sim)+" pts")+datum("Estimación posterior",Math.round(effectivePenalty(sim)*.65)+" pts")+'</div><div class="action-grid">'+taskButton("apply_automatic_compensation","Aplicar compensación automática")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="manual_adjustment")return '<div class="card"><h3>Ajuste manual</h3><div class="form-grid">'+fieldSelect("manual-band","Banda",[["broad","Banda ancha"],["em","Electromagnética"],["subspace","Subespacial"],["thermal","Térmica"]],sim.config.bandFrequency)+fieldSelect("manual-sensitivity","Sensibilidad",[["low","Baja"],["standard","Estándar"],["high","Alta"]],sim.config.sensitivity)+fieldSelect("manual-resolution","Resolución",[["general","General"],["standard","Estándar"],["high","Alta"]],sim.config.defaultResolution)+fieldSelect("manual-integration","Integración",[["standard","Estándar"],["extended","Extendida"]],"standard")+'</div><div class="action-grid">'+taskButton("apply_manual_compensation","Aplicar ajuste manual")+button("restore_previous_compensation","secondary")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="change_band_frequency")return '<div class="card"><h3>Cambiar banda / frecuencia</h3>'+fieldSelect("band-change","Nueva banda",[["em","Electromagnética"],["subspace","Subespacial"],["thermal","Térmica"],["gravimetric","Gravimétrica"]],sim.config.bandFrequency)+'<div class="action-grid">'+taskButton("apply_band_change","Aplicar cambio")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="increase_operation_power")return '<div class="card"><h3>Potencia de operación</h3>'+fieldSelect("operation-power","Uso de la asignación",[["60","60 %"],["75","75 %"],["90","90 %"],["100","100 %"]],String(sim.config.operationPower))+'<div class="action-grid">'+taskButton("apply_operation_power","Aplicar dentro de asignación")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="reduce_resolution")return '<div class="card"><h3>Sacrificar resolución</h3><p>Reduce detalle para ganar estabilidad frente a ruido.</p>'+fieldSelect("reduced-resolution","Resolución objetivo",[["general","General"],["standard","Estándar"]],"general")+'<div class="action-grid">'+taskButton("apply_resolution_change","Aplicar")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="extend_integration")return '<div class="card"><h3>Prolongar integración</h3><p>Acumula señal durante más tiempo; mejora señal/ruido a costa de tiempo.</p><div class="action-grid">'+taskButton("apply_integration_extension","Prolongar integración")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="recover_signal"){
    const opts=knownContacts(sim).map(x=>[x.id,x.id+" · "+x.classification]);
    return '<div class="card"><h3>Recuperar señal</h3>'+fieldSelect("recover-contact","Contacto",opts,contact()?.id)+'<div class="action-grid">'+taskButton("start_signal_recovery","Intentar recuperación")+button("request_additional_power","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  }
  return "";
}
function configurationView(){
  const s=secondary(),sim=shell.sim;
  const map={
    sensitivity:["Sensibilidad",[["low","Baja"],["standard","Estándar"],["high","Alta"],["maximum","Máxima"]],sim.config.sensitivity],
    default_resolution:["Resolución predeterminada",[["general","General"],["standard","Estándar"],["high","Alta"]],sim.config.defaultResolution],
    sensor_power:["Potencia de operación",[["60","60 %"],["75","75 %"],["90","90 %"],["100","100 %"]],String(sim.config.operationPower)],
    sensor_array:["Matriz / conjunto sensor",sim.arrays.filter(a=>a.available).map(a=>[a.id,a.name]),sim.activeArray],
    band_frequency:["Frecuencia / banda",[["broad","Banda ancha"],["em","Electromagnética"],["subspace","Subespacial"],["thermal","Térmica"],["gravimetric","Gravimétrica"]],sim.config.bandFrequency],
    update_rate:["Frecuencia de actualización",[["slow","Lenta"],["standard","Estándar"],["fast","Rápida"]],sim.config.updateRate],
    default_filters:["Filtro predeterminado",[["all","Todas"],["subspace","Subespacial"],["warp","Warp"],["em","Electromagnética"],["thermal","Térmica"],["biological","Biológica"]],sim.config.defaultFilters[0]],
    default_priorities:["Prioridad predeterminada",[["none","Ninguna"],["subspace","Subespacio"],["warp","Warp"],["biological","Biológica"],["transponder","Transpondedor"]],sim.config.defaultPriority]
  };
  if(s.id==="profiles_presets"){
    const rows=Object.entries(sim.profiles).map(([id,p])=>'<div class="contact-row"><strong>'+esc(id)+'</strong><span>'+esc(p.name||id)+'<br><small>'+esc(p.origin)+(p.readOnly?" · protegido":"")+'</small></span><span>'+taskButton("load_profile:"+id,"Cargar")+(p.readOnly?"":taskButton("delete_profile:"+id,"Eliminar","secondary"))+'</span></div>').join("");
    return '<div class="card"><h3>Perfiles / preajustes</h3><div class="contact-list">'+rows+'</div><div class="form-grid">'+fieldInput("profile-id","ID perfil","mi_perfil")+fieldInput("profile-name","Nombre","Mi perfil")+'</div><div class="action-grid">'+taskButton("save_profile","Guardar / actualizar perfil actual")+taskButton("restore_ship_standard","Restaurar estándar","secondary")+'</div></div>';
  }
  if(s.id==="default_filters"){
    return '<div class="card"><h3>Filtros predeterminados</h3><p>Puede combinar varias firmas. Estos filtros se cargarán por defecto en nuevos barridos.</p>'+fieldMultiSelect("config-value","Filtros",[["all","Todas"],["em","Electromagnética"],["subspace","Subespacial"],["gravimetric","Gravimétrica"],["thermal","Térmica"],["ionizing_radiation","Radiación ionizante"],["particle","Partículas"],["biological","Biológica"],["warp","Warp"],["transponder","Transpondedor"]],sim.config.defaultFilters)+'<div class="action-grid">'+taskButton("apply_setting","Aplicar")+taskButton("restore_ship_standard","Restaurar estándar","secondary")+'</div></div>';
  }
  const [label,opts,val]=map[s.id]||[];
  if(!label)return "";
  return '<div class="card"><h3>'+esc(label)+'</h3><p>Los cambios modifican valores predeterminados; no ejecutan operaciones por sí solos.</p>'+fieldSelect("config-value",label,opts,val)+'<div class="action-grid">'+taskButton("apply_setting","Aplicar")+taskButton("restore_ship_standard","Restaurar estándar","secondary")+(s.id==="sensor_power"?button("request_additional_power","secondary")+(sim.powerRequest?button("cancel_power_request","secondary"):""):"")+(s.id==="sensor_array"?taskButton("open_array_status","Abrir estado de matrices","secondary"):"")+'</div></div>';
}
function resultCard(r){
  return '<div class="contact-row '+(r.id===shell.selectedResultId?"active":"")+'" data-result="'+r.id+'"><strong>'+esc(r.id)+'</strong><span><b>'+esc(operationLabel(r))+'</b><br><small>'+esc(resultSubject(r))+'</small><br><small>'+esc(r.summary)+'</small></span><strong>'+esc(r.time)+'</strong></div>';
}
function resultsView(){
  const s=secondary(),sim=shell.sim;
  if(s.id==="current_operation")return '<div class="card"><h3>Operación actual</h3>'+activeOpsHtml()+'<div class="action-grid">'+button("cancel_operation","secondary")+button("request_additional_power","secondary")+'</div></div>';
  if(s.id==="last_scan"){
    const r=sim.results.find(x=>x.type==="scan");return r?'<div class="card"><h3>Último barrido</h3>'+resultDetail(r)+'</div>':'<div class="notice">No hay barridos completados.</div>';
  }
  if(s.id==="recent_results")return '<div class="card"><h3>Resultados recientes</h3><div class="contact-list">'+(sim.results.map(resultCard).join("")||'<div class="notice">Sin resultados.</div>')+'</div></div>'+selectedResultDetail();
  if(s.id==="saved_readings"){const rows=sim.savedReadings.map(r=>'<div class="contact-row '+(r.savedId===shell.selectedResultId?"active":"")+'" data-saved-result="'+r.savedId+'"><strong>'+esc(r.savedId)+'</strong><span>'+esc(r.label)+'<br><small>'+esc(r.summary)+'</small></span><strong>'+esc(r.time)+'</strong></div>').join("");const selected=sim.savedReadings.find(x=>x.savedId===shell.selectedResultId);return '<div class="card"><h3>Lecturas guardadas</h3><div class="contact-list">'+(rows||'<div class="notice">No hay lecturas guardadas.</div>')+'</div></div>'+(selected?'<div class="card"><h3>Lectura guardada · '+esc(selected.savedId)+'</h3>'+resultDetail(selected)+'</div>':"")}
  if(s.id==="compare_readings"){
    const all=[...sim.results.map(r=>[r.id,r.id+" · "+operationLabel(r)+" · "+resultSubject(r)]),...sim.savedReadings.map(r=>[r.savedId,r.savedId+" · "+r.label])];
    return '<div class="card"><h3>Comparar lecturas</h3><div class="form-grid">'+fieldSelect("compare-a","Lectura A",all,all[0]?.[0]||"")+fieldSelect("compare-b","Lectura B",all,all[1]?.[0]||all[0]?.[0]||"")+'</div><div class="action-grid">'+taskButton("execute_comparison","Comparar")+'</div></div>'+(sim.comparisons[0]?'<div class="card"><h3>Última comparación</h3><p>'+esc(sim.comparisons[0].summary)+'</p></div>':"");
  }
  if(s.id==="repeat_operation"){
    const scans=sim.results.filter(r=>r.type==="scan"||r.type==="search").map(r=>[r.id,r.id+" · "+operationLabel(r)+" · "+resultSubject(r)]);
    return '<div class="card"><h3>Repetir operación</h3>'+fieldSelect("repeat-source","Resultado origen",scans,scans[0]?.[0]||"")+'<p>Se reutiliza la configuración, pero el resultado se resuelve contra el estado actual del escenario.</p><div class="action-grid">'+taskButton("execute_repeated_operation","Repetir operación")+taskButton("edit_before_repeat","Editar antes de repetir","secondary")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  }
  return "";
}
function resultDetail(r){return '<div class="data-grid">'+datum("ID de operación",r.id||r.savedId||"—")+datum("Operación",operationLabel(r))+datum("Contacto(s)",resultSubject(r))+datum("Objetivo",humanTarget(r.target))+datum("Calidad",r.quality??"—")+datum("Procedencia",r.provenance)+datum("Resumen",r.summary)+datum("Observaciones",r.observations?.length??0)+(r.emissionExposure?datum("Exposición del barrido",r.emissionExposure):"")+'</div><div class="action-grid">'+button("save_reading")+button("compare_readings","secondary")+button("repeat_operation","secondary")+button("send_data","secondary")+'</div>'}
function selectedResultDetail(){
  const r=shell.sim.results.find(x=>x.id===shell.selectedResultId);
  if(!r)return "";
  const candidates=r.type==="search"?'<div class="result-candidates"><h3>Candidatos observados</h3>'+resultCandidatesHtml(r)+'</div>':"";
  return '<div class="card"><h3>Detalle · '+esc(r.id)+' · '+esc(operationLabel(r))+'</h3>'+resultDetail(r)+candidates+'</div>';
}
function resultCandidatesHtml(r){
  const observations=r?.observations||[];
  if(!observations.length)return '<div class="notice">Sin candidatos concluyentes.</div>';
  return '<div class="contact-list">'+observations.map(o=>{
    const real=!o.falsePositive&&!!getContact(shell.sim,o.id);
    const attrs=real?' data-search-contact="'+esc(o.id)+'" title="Seleccionar '+esc(o.id)+'"':"";
    const cls='contact-row '+(real?'result-contact-selectable':'result-contact-nonselectable');
    const label=o.classification||getContact(shell.sim,o.id)?.classification||"Contacto";
    const confidence=o.match??o.confidence??"—";
    return '<div class="'+cls+'"'+attrs+'><strong>'+esc(o.id)+'</strong><span>'+esc(label)+(o.falsePositive?'<br><small>Traza no confirmada · posible falso positivo</small>':'<br><small>Pulsar para seleccionar contacto</small>')+'</span><strong>'+esc(confidence)+'%</strong></div>';
  }).join("")+'</div>';
}
function latestResultMini(type){
  const r=shell.sim.results.find(x=>x.type===type);
  return r?'<div class="card"><h3>Último resultado · '+esc(r.id)+' · '+esc(operationLabel(r))+'</h3>'+resultCandidatesHtml(r)+'</div>':"";
}
function diagnosticsView(){
  const s=secondary(),sim=shell.sim;
  if(s.id==="self_test")return '<div class="card"><h3>Autodiagnóstico</h3>'+fieldSelect("diag-scope","Ámbito",[["all","Todos los sensores"],...sim.arrays.map(a=>[a.id,a.name])],"all")+'<div class="action-grid">'+taskButton("run_diagnostic","Ejecutar autodiagnóstico")+'</div></div>'+diagnosticLatest();
  if(s.id==="array_status")return '<div class="card"><h3>Estado por matriz</h3><div class="contact-list">'+sim.arrays.map(a=>'<div class="contact-row '+(a.id===shell.selectedArrayId?"active":"")+'" data-array="'+a.id+'"><strong>'+a.id+'</strong><span>'+esc(a.name)+'<br><small>'+esc(a.error||"Sin errores registrados")+'</small></span><strong>'+a.integrity+'%</strong></div>').join("")+'</div></div>'+arrayDetail();
  if(s.id==="calibration")return '<div class="card"><h3>Calibración</h3>'+fieldSelect("cal-array","Matriz",sim.arrays.map(a=>[a.id,a.name]),sim.activeArray)+'<p>La matriz seleccionada estará ocupada durante el procedimiento.</p><div class="action-grid">'+taskButton("start_calibration","Iniciar calibración")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
  if(s.id==="performance"){const a=getArray(sim);return '<div class="card"><h3>Rendimiento</h3><div class="data-grid">'+datum("Matriz activa",a?.name)+datum("Integridad",a?.integrity+" %")+datum("Calibración",a?.calibration+" %")+datum("Penalización total",effectivePenalty(sim)+" pts")+datum("Tracking",trackingUsed(sim)+" / "+sim.tracking.capacity)+datum("Potencia",sim.power+" %")+'</div><div class="action-grid">'+button("run_self_test")+button("request_engineering_support","secondary")+button("request_additional_power","secondary")+'</div></div>'}
  if(s.id==="errors_degradation"){
    const issues=sim.diagnostics.flatMap(d=>d.issues||[]);
    return '<div class="card"><h3>Errores / degradación</h3><div class="contact-list">'+(issues.map(i=>'<div class="contact-row"><strong>'+esc(i.code)+'</strong><span>'+esc(i.component)+'<br><small>'+esc(i.effect)+'</small></span><strong>'+esc(i.severity)+'</strong></div>').join("")||'<div class="notice">Ejecute un autodiagnóstico para actualizar incidencias.</div>')+'</div></div>';
  }
  if(s.id==="request_engineering_support")return engineeringRequestForm();
  return "";
}
function diagnosticLatest(){const d=shell.sim.diagnostics[0];return d?'<div class="card"><h3>Resultado '+d.id+'</h3><div class="data-grid">'+datum("Estado",d.status)+datum("Incidencias",d.issues.length)+datum("Ámbito",d.scope)+datum("Hora",d.time)+'</div></div>':""}
function engineeringRequestForm(){
  const sim=shell.sim,a=getArray(sim);
  return '<div class="card"><h3>Solicitud a Ingeniería</h3><div class="form-grid">'+fieldSelect("eng-component","Componente",sim.arrays.map(x=>[x.id,x.name]),a?.id)+fieldInput("eng-code","Código diagnóstico",a?.error||"")+fieldInput("eng-problem","Problema","Degradación de sensores")+fieldSelect("eng-priority","Prioridad",[["routine","Rutina"],["operational","Operativa"],["urgent","Urgente"]],"operational")+'</div><div class="action-grid">'+taskButton("send_engineering_support_request","Enviar solicitud")+taskButton("cancel","Cancelar","secondary")+'</div></div>';
}
function powerRequestView(){
  const sim=shell.sim;
  return '<div class="card"><h3>Solicitar potencia adicional a Operaciones</h3><p>Sensores solicita capacidad adicional. No puede decidir qué sistema cede energía.</p><div class="form-grid">'+fieldInput("power-current","Potencia actual",sim.power+" %")+fieldSelect("power-delta","Incremento",[["5","+5 %"],["10","+10 %"],["15","+15 %"],["20","+20 %"]],"10")+fieldSelect("power-priority","Prioridad",[["Rutina","Rutina"],["Operativa","Operativa"],["Urgente","Urgente"]],"Operativa")+fieldSelect("power-duration","Duración",[["single_operation","Una operación"],["timed","Temporal"],["until_released","Hasta liberar"]],"single_operation")+fieldInput("power-reason","Motivo","Necesidad sensora operacional")+'</div><div class="action-grid">'+taskButton("send_power_request","Enviar solicitud")+taskButton("cancel_special","Cancelar","secondary")+'</div></div>';
}
function handoffView(){
  const c=contact();
  return '<div class="card"><h3>Enviar datos</h3><div class="form-grid">'+fieldSelect("handoff-target","Destino",[["science","Ciencia"],["tactical","Táctica"],["operations","Operaciones"],["conn","CONN / Navegación"],["command","Mando"],["computer","Ordenador / Base de datos"]],shell.prefill?.target||"science")+fieldInput("handoff-contact","Contacto",c?.id||"")+fieldSelect("handoff-priority","Prioridad",[["routine","Rutina"],["operational","Operativa"],["urgent","Urgente"]],"operational")+fieldInput("handoff-request","Análisis / nota solicitada",shell.prefill?.request||"Revisar datos adjuntos")+'</div><div class="action-grid">'+taskButton("send_handoff","Confirmar envío")+taskButton("cancel_special","Cancelar","secondary")+'</div></div>';
}
function activeOpsHtml(){
  return shell.sim.operations.filter(o=>o.state==="running").length?shell.sim.operations.filter(o=>o.state==="running").map(o=>'<div class="datum"><small>'+esc(o.id)+' · '+esc(o.type)+'</small><strong>'+esc(o.config.targetLabel||o.config.area||o.config.contactId||"—")+' · '+o.progress+'%</strong><div class="progress"><span style="width:'+o.progress+'%"></span></div></div>').join(""):'<div class="notice">No hay operaciones activas.</div>';
}
function wireSpecific(){
  document.querySelectorAll("[data-contact]").forEach(el=>el.onclick=()=>{shell.sim.selectedContactId=el.dataset.contact;log("SELECT "+el.dataset.contact);emitTeacherEvent("SELECT_CONTACT",{contactId:el.dataset.contact});render()});
  document.querySelectorAll("[data-array]").forEach(el=>el.onclick=()=>{shell.selectedArrayId=el.dataset.array;renderWorkspace()});
  document.querySelectorAll("[data-search-contact]").forEach(el=>el.onclick=()=>{
    const id=el.dataset.searchContact;
    if(!getContact(shell.sim,id))return;
    shell.sim.selectedContactId=id;
    log("SELECT "+id+" · from search result");
    emitTeacherEvent("SELECT_CONTACT",{contactId:id,source:"search_result"});
    shell.primaryId="contacts";
    shell.secondaryId="all";
    shell.special=null;
    shell.prefill=null;
    render();
  });
  document.querySelectorAll("[data-result]").forEach(el=>el.onclick=()=>{
    shell.selectedResultId=el.dataset.result;
    const r=shell.sim.results.find(x=>x.id===shell.selectedResultId);
    if(r){
      log("OPEN RESULT "+r.id+" · "+r.type+"/"+r.subtype);
      emitTeacherEvent("RESULT_OPEN",{resultId:r.id,type:r.type,subtype:r.subtype,target:r.target});
    }
    renderWorkspace();
  });
  document.querySelectorAll("[data-saved-result]").forEach(el=>el.onclick=()=>{shell.selectedResultId=el.dataset.savedResult;renderWorkspace()});
  if(shell.primaryId==="scans")["scan-mode","target-scope","resolution","priority","duration","filters"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("change",()=>{const cfg=scanConfig();log("CONFIG "+id+"="+el.value);emitTeacherEvent("SCAN_CONFIG_CHANGE",{controlId:id,value:el.value,...cfg})})});
}
function scanConfig(){
  const focused=shell.secondaryId==="focused";
  return {
    scanType:shell.secondaryId,mode:$("#scan-mode")?.value||"passive",
    targetValue:$("#target-scope")?.value||"",targetLabel:$("#target-scope")?.selectedOptions?.[0]?.textContent||"",
    contactId:focused?(contact()?.id||$("#target-scope")?.value||null):null,
    resolution:$("#resolution")?.value||"standard",priority:$("#priority")?.value||"none",
    duration:$("#duration")?.value||"standard",filters:$("#filters")?[...$("#filters").selectedOptions].map(o=>o.value):["all"]
  };
}
function runTimed(op,resolveFn,eventPrefix){
  const total=operationDuration(op.config),tick=200,step=100/(total/tick);
  const timer=setInterval(()=>{
    op.progress=Math.min(100,Math.round(op.progress+step));renderStatus();
    if(op.progress>=100){
      clearInterval(timer);shell.timers.delete(timer);
      const result=resolveFn();log("COMPLETE "+op.id+" · "+result.summary);
      emitTeacherEvent(eventPrefix+"_COMPLETE",{operationId:op.id,resultId:result.id,subtype:result.subtype,contactId:op.config.contactId||null,targetValue:op.config.targetValue||op.config.area||null});
      if(shell.sim.powerRequest?.granted&&shell.sim.powerRequest?.duration==="single_operation"&&["APROBADA","APROBADA PARCIAL"].includes(shell.sim.powerRequest.state)){const g=shell.sim.powerRequest.granted;shell.sim.power=Math.max(shell.sim.basePower,shell.sim.power-g);shell.sim.powerBudget+=g;shell.sim.powerRequest.state="LIBERADA";log("POWER AUTO-RELEASE +"+g+"% → OPS");emitTeacherEvent("POWER_RELEASE",{releasedDelta:g,automatic:true})}
      render();
    }
  },tick);shell.timers.add(timer);
}
function executeScan(){
  const cfg=scanConfig();
  if(cfg.scanType==="focused"&&!cfg.contactId){notify("El barrido focalizado exige un objetivo.","danger");return}
  const op=createOperation(shell.sim,"scan:"+cfg.scanType,cfg);
  log("EXECUTE scan "+cfg.scanType+" · "+cfg.targetLabel);
  emitTeacherEvent("SCAN_EXECUTE",{...cfg,operationId:op.id});
  runTimed(op,()=>resolveScan(shell.sim,op),"SCAN");
  renderStatus();
}
function executeSearch(){
  const cfg={searchType:shell.secondaryId,area:$("#search-area")?.value||"sector_041",sensitivity:$("#search-sensitivity")?.value||"standard",resolution:$("#search-resolution")?.value||"standard",criteria:$("#search-criteria")?.value||"",duration:"standard"};
  if(cfg.searchType==="custom_signature"&&!cfg.criteria.trim()){notify("Una firma definida necesita al menos un criterio de búsqueda.","danger");return}
  const op=createOperation(shell.sim,"search:"+cfg.searchType,cfg);
  log("EXECUTE search "+cfg.searchType+" · "+cfg.area);emitTeacherEvent("SEARCH_EXECUTE",{...cfg,operationId:op.id});
  runTimed(op,()=>{const r=resolveSearch(shell.sim,cfg,op.id);op.state="completed";op.progress=100;return r},"SEARCH");
  renderStatus();
}
function doTask(id){
  const sim=shell.sim,c=contact();
  if(id==="execute_scan"){executeScan();return}
  if(id==="review_scan_configuration"){const cfg=scanConfig();notify("Configuración: "+cfg.scanType+" · "+cfg.targetLabel+" · "+cfg.mode+" · resolución "+cfg.resolution+" · filtros "+cfg.filters.join(", ")+" · prioridad "+cfg.priority+" · "+cfg.duration+".");emitTeacherEvent("SCAN_REVIEW",cfg);return}
  if(id==="restore_operation_defaults"){shell.prefill=null;renderWorkspace();emitTeacherEvent("SCAN_DEFAULTS_RESTORED",{scanType:shell.secondaryId});return}
  if(id==="start_search"){executeSearch();return}
  if(id==="clear_search_criteria"){const el=$("#search-criteria");if(el)el.value="";emitTeacherEvent("SEARCH_CRITERIA_CLEAR",{searchType:shell.secondaryId});notify("Criterio adicional limpiado.");return}
  if(id==="cancel"){shell.special=null;shell.prefill=null;shell.secondaryId=primary()?.secondary?.[0]?.id||shell.secondaryId;emitTeacherEvent("TASK_CANCEL",{primaryId:shell.primaryId});render();return}
  if(id==="cancel_special"){shell.special=null;shell.prefill=null;renderWorkspace();return}
  if(id==="send_power_request"){
    const req={state:"PENDIENTE",requested:Number($("#power-delta").value),priority:$("#power-priority").value,duration:$("#power-duration").value,reason:$("#power-reason").value,contactId:c?.id||null};
    sim.powerRequest=req;log("POWER REQUEST +"+req.requested+"% → OPS");emitTeacherEvent("POWER_REQUEST",{requestedDelta:req.requested,priority:req.priority,contactId:req.contactId});shell.special=null;render();
    const t=setTimeout(()=>{shell.timers.delete(t);sim.powerRequest=makePowerResponse(sim,req);log("OPS RESPONSE "+sim.powerRequest.state+" +"+sim.powerRequest.granted+"%");emitTeacherEvent("POWER_RESPONSE",{state:sim.powerRequest.state,grantedDelta:sim.powerRequest.granted});render()},850);shell.timers.add(t);return;
  }
  if(id==="send_handoff"){
    const target=$("#handoff-target").value,contactId=$("#handoff-contact").value,priority=$("#handoff-priority").value,request=$("#handoff-request").value;
    const tx=transferData(sim,target,contactId,{priority,request});log("TRANSFER "+contactId+" → "+target.toUpperCase());emitTeacherEvent("HANDOFF",{target,contactId,transferId:tx.id});shell.special=null;shell.prefill=null;notify("Datos enviados a "+target.toUpperCase()+".","success");return;
  }
  if(id==="start_tracking"){
    const cid=$("#track-contact").value,mode=$("#track-mode").value,priority=$("#track-priority").value,res=startTracking(sim,cid,mode,priority);
    if(!res.ok){notify(res.reason,"danger");return}log("TRACK START "+cid+" · "+mode+" · "+priority);emitTeacherEvent("TRACK_START",{contactId:cid,mode,priority});render();return;
  }
  if(id.startsWith("track_start:")){const cid=id.split(":")[1],res=startTracking(sim,cid);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("TRACK_START",{contactId:cid,mode:"normal",priority:"normal"});log("TRACK START "+cid);render();return}
  if(id.startsWith("track_stop:")){const cid=id.split(":")[1];stopTracking(sim,cid);emitTeacherEvent("TRACK_STOP",{contactId:cid});log("TRACK STOP "+cid);render();return}
  if(id.startsWith("track_toggle_priority:")){const cid=id.split(":")[1],x=getContact(sim,cid),prio=x.trackingPriority==="priority"?"normal":"priority",res=startTracking(sim,cid,x.trackingMode||"normal",prio);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("TRACK_PRIORITY",{contactId:cid,priority:prio});log("TRACK PRIORITY "+cid+" → "+prio);render();return}
  if(id==="apply_tracking_priorities"){
    const plan=[...document.querySelectorAll(".tracking-plan")].map(el=>({contactId:el.dataset.planContact,value:el.value}));
    const total=plan.reduce((n,p)=>n+(p.value==="priority"?2:p.value==="normal"?1:0),0);
    if(total>sim.tracking.capacity){notify("La distribución requiere "+total+" unidades y solo hay "+sim.tracking.capacity+".","danger");emitTeacherEvent("TRACK_CAPACITY_REJECTED",{requested:total,capacity:sim.tracking.capacity});return}
    const before=new Map(sim.tracking.assignments.map(a=>[a.contactId,{...a}]));
    for(const p of plan){if(p.value==="off"&&before.has(p.contactId)){stopTracking(sim,p.contactId);log("TRACK STOP "+p.contactId);emitTeacherEvent("TRACK_STOP",{contactId:p.contactId})}}
    for(const p of plan){
      if(p.value==="off")continue;
      const old=before.get(p.contactId),priority=p.value==="priority"?"priority":"normal";
      if(!old){
        const res=startTracking(sim,p.contactId,"normal",priority);if(!res.ok){notify(res.reason,"danger");return}
        log("TRACK START "+p.contactId+" · "+priority);emitTeacherEvent("TRACK_START",{contactId:p.contactId,mode:"normal",priority});
        if(priority==="priority")emitTeacherEvent("TRACK_PRIORITY",{contactId:p.contactId,priority:"priority"});
      }else if(old.priority!==priority){
        const res=startTracking(sim,p.contactId,old.mode||"normal",priority);if(!res.ok){notify(res.reason,"danger");return}
        log("TRACK PRIORITY "+p.contactId+" → "+priority);emitTeacherEvent("TRACK_PRIORITY",{contactId:p.contactId,priority});
      }
    }
    emitTeacherEvent("TRACK_CAPACITY_APPLY",{used:trackingUsed(sim),capacity:sim.tracking.capacity});notify("Distribución de seguimiento aplicada: "+trackingUsed(sim)+" / "+sim.tracking.capacity+".","success");return;
  }
  if(id==="start_signature_tracking"){
    const cid=$("#sig-contact").value,sig=$("#sig-type").value,res=startTracking(sim,cid,"signature","priority",sig);
    if(!res.ok){notify(res.reason,"danger");return}log("TRACK SIGNATURE "+cid+" · "+sig);emitTeacherEvent("TRACK_SIGNATURE",{contactId:cid,signature:sig});render();return;
  }
  if(["execute_position_update","execute_course_estimation","execute_velocity_estimation","execute_trajectory_prediction"].includes(id)){
    const cid=$("#track-op-contact").value,kind={execute_position_update:"position",execute_course_estimation:"course",execute_velocity_estimation:"velocity",execute_trajectory_prediction:"trajectory"}[id];
    const res=updateTracking(sim,cid,kind,{horizon:$("#prediction-horizon")?.value});
    if(!res.ok){notify(res.reason,"danger");return}log("TRACK "+kind.toUpperCase()+" "+cid+" · "+res.value);emitTeacherEvent("TRACK_OPERATION",{contactId:cid,operation:kind,value:res.value});notify(res.value,"success");return;
  }
  if(id==="start_reacquisition"){
    const cid=$("#lost-contact").value,res=updateTracking(sim,cid,"reacquire",{window:$("#search-window").value});
    if(!res.ok){notify(res.reason,"danger");return}shell.sim.selectedContactId=cid;log("REACQUIRE "+cid+" · "+res.value);emitTeacherEvent("REACQUIRE",{contactId:cid});notify(res.value,"success");return;
  }
  if(id==="apply_automatic_compensation"){const res=applyInterference(sim,"automatic");log("INTERFERENCE AUTO");emitTeacherEvent("INTERFERENCE_ACTION",{action:"automatic"});notify(res.message,"success");return}
  if(id==="apply_manual_compensation"){const res=applyInterference(sim,"manual",{band:$("#manual-band").value});sim.config.sensitivity=$("#manual-sensitivity").value;sim.config.defaultResolution=$("#manual-resolution").value;if($("#manual-integration").value==="extended")applyInterference(sim,"extend");log("INTERFERENCE MANUAL");emitTeacherEvent("INTERFERENCE_ACTION",{action:"manual",band:sim.config.bandFrequency});notify(res.message,"success");return}
  if(id==="apply_band_change"){const band=$("#band-change").value,res=applyInterference(sim,"band",{band});log("BAND "+band);emitTeacherEvent("INTERFERENCE_ACTION",{action:"band",band});notify(res.message,"success");return}
  if(id==="apply_operation_power"){const value=$("#operation-power").value,res=applyInterference(sim,"power",{value});emitTeacherEvent("INTERFERENCE_ACTION",{action:"operation_power",value:Number(value)});notify(res.message,"success");return}
  if(id==="apply_resolution_change"){const resolution=$("#reduced-resolution").value,res=applyInterference(sim,"reduce_resolution",{resolution});emitTeacherEvent("INTERFERENCE_ACTION",{action:"reduce_resolution",resolution});notify(res.message,"success");return}
  if(id==="apply_integration_extension"){const res=applyInterference(sim,"extend");emitTeacherEvent("INTERFERENCE_ACTION",{action:"extend_integration"});notify(res.message,"success");return}
  if(id==="start_signal_recovery"){const cid=$("#recover-contact").value,res=applyInterference(sim,"recover",{contactId:cid});if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("INTERFERENCE_ACTION",{action:"recover_signal",contactId:cid});notify(res.message||res.value,"success");return}
  if(id==="apply_setting"){
    const sid=shell.secondaryId,key={sensitivity:"sensitivity",default_resolution:"defaultResolution",sensor_power:"sensor_power",sensor_array:"sensor_array",band_frequency:"bandFrequency",update_rate:"updateRate",default_filters:"defaultFilters",default_priorities:"defaultPriority"}[sid];
    const el=$("#config-value"),val=sid==="default_filters"?[...el.selectedOptions].map(o=>o.value):el.value;
    const actual=val,res=applyConfig(sim,key,actual);if(!res.ok){notify(res.reason,"danger");return}log("CONFIG APPLY "+sid+"="+(Array.isArray(val)?val.join(","):val));emitTeacherEvent("CONFIG_APPLY",{setting:sid,value:val});notify("Configuración aplicada.","success");return;
  }
  if(id==="open_array_status"){shell.primaryId="status";shell.secondaryId="available_arrays";render();return}
  if(id==="restore_ship_standard"){restoreStandard(sim);log("CONFIG RESTORE STANDARD");emitTeacherEvent("CONFIG_RESTORE",{profile:"standard"});notify("Estándar de la nave restaurado.","success");return}
  if(id.startsWith("load_profile:")){const pid=id.split(":")[1],res=loadProfile(sim,pid);if(!res.ok){notify(res.reason,"danger");return}log("PROFILE LOAD "+pid);emitTeacherEvent("PROFILE_LOAD",{profileId:pid});notify("Perfil "+pid+" cargado.","success");return}
  if(id==="save_profile"){const pid=$("#profile-id").value.trim(),name=$("#profile-name").value.trim();if(!pid||!name){notify("Indique ID y nombre.","danger");return}const res=saveProfile(sim,pid,name);if(!res.ok){notify(res.reason,"danger");return}log("PROFILE SAVE "+pid);emitTeacherEvent("PROFILE_SAVE",{profileId:pid});render();return}
  if(id.startsWith("delete_profile:")){const pid=id.split(":")[1],res=deleteProfile(sim,pid);if(!res.ok){notify(res.reason,"danger");return}log("PROFILE DELETE "+pid);render();return}
  if(id==="execute_comparison"){const res=compareReadings(sim,$("#compare-a").value,$("#compare-b").value);if(!res.ok){notify(res.reason,"danger");return}log("COMPARE "+res.comparison.a+" ↔ "+res.comparison.b);emitTeacherEvent("RESULT_COMPARE",{a:res.comparison.a,b:res.comparison.b});notify(res.comparison.summary,"success");return}
  if(id==="edit_before_repeat"){
    const rid=$("#repeat-source").value,r=sim.results.find(x=>x.id===rid);if(!r){notify("Resultado no encontrado.","danger");return}
    shell.prefill={...(r.configuration||{})};shell.special=null;
    if(r.type==="scan"){shell.primaryId="scans";shell.secondaryId=r.subtype}
    else{shell.primaryId="search_localize";shell.secondaryId=r.subtype}
    log("EDIT BEFORE REPEAT "+rid);emitTeacherEvent("RESULT_EDIT_BEFORE_REPEAT",{sourceResultId:rid,type:r.type});render();return;
  }
  if(id==="execute_repeated_operation"){
    const rid=$("#repeat-source").value,r=sim.results.find(x=>x.id===rid);if(!r){notify("Resultado no encontrado.","danger");return}
    log("REPEAT "+rid);emitTeacherEvent("RESULT_REPEAT",{sourceResultId:rid,type:r.type});
    if(r.type==="scan"){const op=createOperation(sim,"scan:"+r.subtype,r.configuration);runTimed(op,()=>resolveScan(sim,op),"SCAN");renderStatus()}
    else if(r.type==="search"){const op=createOperation(sim,"search:"+r.subtype,r.configuration);runTimed(op,()=>{const rr=resolveSearch(sim,r.configuration,op.id);op.state="completed";op.progress=100;return rr},"SEARCH");renderStatus()}
    return;
  }
  if(id==="run_diagnostic"){const d=runDiagnostic(sim,$("#diag-scope").value);log("DIAGNOSTIC "+d.id+" · "+d.status);emitTeacherEvent("DIAGNOSTIC_RUN",{scope:d.scope,status:d.status,issues:d.issues.length});render();return}
  if(id==="start_calibration"){const aid=$("#cal-array").value,res=calibrateArray(sim,aid);if(!res.ok){notify(res.reason,"danger");return}log("CALIBRATE "+aid);emitTeacherEvent("CALIBRATION",{arrayId:aid});notify(res.message,"success");return}
  if(id==="send_engineering_support_request"){const payload={component:$("#eng-component").value,diagnosticCode:$("#eng-code").value,problem:$("#eng-problem").value,priority:$("#eng-priority").value},req=requestEngineering(sim,payload);log("ENGINEERING REQUEST "+req.id+" · "+payload.component);emitTeacherEvent("ENGINEERING_REQUEST",{component:payload.component,priority:payload.priority,requestId:req.id});notify("Solicitud "+req.id+" enviada a Ingeniería.","success");return}
}
function doAction(id){
  const sim=shell.sim,c=contact();log("ACTION "+id);emitTeacherEvent("ACTION",{actionId:id,contactId:c?.id||null});
  if(id==="request_additional_power"){shell.special="power_request";renderWorkspace();return}
  if(id==="cancel_power_request"){if(sim.powerRequest){const granted=sim.powerRequest.granted||0;if(granted){sim.power=Math.max(sim.basePower,sim.power-granted);sim.powerBudget+=granted;sim.powerRequest.state="LIBERADA";log("POWER RELEASE +"+granted+"% → OPS");emitTeacherEvent("POWER_RELEASE",{releasedDelta:granted})}else{sim.powerRequest.state="CANCELADA";emitTeacherEvent("POWER_CANCEL",{})}}render();return}
  if(id==="focused_scan"||id==="high_resolution_scan"){shell.primaryId="scans";shell.secondaryId="focused";shell.special=null;shell.prefill={resolution:id==="high_resolution_scan"?"high":"standard"};render();return}
  if(id==="start_tracking"){const res=startTracking(sim,c.id);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("TRACK_START",{contactId:c.id,mode:"normal",priority:"normal"});render();return}
  if(id==="stop_tracking"||id==="release_tracking_slot"){stopTracking(sim,c.id);emitTeacherEvent("TRACK_STOP",{contactId:c.id});render();return}
  if(id==="set_priority_tracking"||id==="set_normal_tracking"){const priority=id==="set_priority_tracking"?"priority":"normal",res=startTracking(sim,c.id,c.trackingMode||"normal",priority);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("TRACK_PRIORITY",{contactId:c.id,priority});render();return}
  if(id==="mark_contact"){c.marked=true;emitTeacherEvent("CONTACT_MARK",{contactId:c.id,marked:true});render();return}
  if(id==="unmark_contact"){c.marked=false;emitTeacherEvent("CONTACT_MARK",{contactId:c.id,marked:false});render();return}
  if(id==="open_sensor_readout"){shell.primaryId="sensor_readout";shell.secondaryId="signal_strength";shell.special=null;emitTeacherEvent("READOUT_OPEN",{contactId:c.id,readout:"signal_strength"});render();return}
  if(id==="compare_readings"){shell.primaryId="results";shell.secondaryId="compare_readings";shell.special=null;render();return}
  if(id==="save_reading"){const r=sim.results.find(x=>x.id===shell.selectedResultId)||sim.results[0];if(!r){notify("No existe un resultado para guardar.","danger");return}const res=saveReading(sim,r.id,"Lectura "+r.id);log("SAVE READING "+r.id);emitTeacherEvent("RESULT_SAVE",{resultId:r.id,savedId:res.saved.savedId});notify("Lectura guardada como "+res.saved.savedId+".","success");return}
  if(id==="repeat_operation"){shell.primaryId="results";shell.secondaryId="repeat_operation";render();return}
  if(["send_data","send_to_science","send_to_tactical"].includes(id)){shell.special="handoff";shell.prefill={target:id==="send_to_science"?"science":id==="send_to_tactical"?"tactical":"science"};renderWorkspace();return}
  if(id==="automatic_compensation"){shell.primaryId="interference";shell.secondaryId="automatic_compensation";render();return}
  if(id==="manual_compensation"){shell.primaryId="interference";shell.secondaryId="manual_adjustment";render();return}
  if(id==="change_band"){shell.primaryId="interference";shell.secondaryId="change_band_frequency";render();return}
  if(id==="extend_integration"){shell.primaryId="interference";shell.secondaryId="extend_integration";render();return}
  if(id==="recover_signal"){shell.primaryId="interference";shell.secondaryId="recover_signal";render();return}
  if(id==="restore_previous_compensation"){const res=applyInterference(sim,"restore");emitTeacherEvent("INTERFERENCE_ACTION",{action:"restore"});notify(res.message,"success");return}
  if(id==="open_interference"){shell.primaryId="interference";shell.secondaryId="interference_status";render();return}
  if(id==="open_diagnostics"){shell.primaryId="diagnostics";shell.secondaryId="array_status";render();return}
  if(id==="run_self_test"){const d=runDiagnostic(sim,"all");emitTeacherEvent("DIAGNOSTIC_RUN",{scope:"all",status:d.status,issues:d.issues.length});notify("Autodiagnóstico: "+d.status+" · "+d.issues.length+" incidencia(s).","success");return}
  if(id==="calibrate_array"){const aid=shell.selectedArrayId||sim.activeArray,res=calibrateArray(sim,aid);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("CALIBRATION",{arrayId:aid});notify(res.message,"success");return}
  if(id==="run_array_diagnostic"){const aid=shell.selectedArrayId||sim.activeArray,d=runDiagnostic(sim,aid);emitTeacherEvent("DIAGNOSTIC_RUN",{scope:aid,status:d.status,issues:d.issues.length});notify("Diagnóstico "+aid+": "+d.status+".","success");return}
  if(id==="select_array"){const aid=shell.selectedArrayId||sim.activeArray,res=applyConfig(sim,"sensor_array",aid);if(!res.ok){notify(res.reason,"danger");return}emitTeacherEvent("CONFIG_APPLY",{setting:"sensor_array",value:aid});notify("Matriz "+aid+" seleccionada.","success");return}
  if(id==="request_engineering_support"){shell.primaryId="diagnostics";shell.secondaryId="request_engineering_support";render();return}
  if(id==="open_current_result"){shell.primaryId="results";shell.secondaryId="current_operation";render();return}
  if(id==="cancel_operation"){for(const o of sim.operations.filter(x=>x.state==="running"))o.state="cancelled";clearTimers();emitTeacherEvent("OPERATION_CANCEL",{});render();return}
  if(id==="reacquire_contact"){shell.primaryId="tracking";shell.secondaryId="reacquire_lost_contact";render();return}
  if(id==="predict_trajectory"){shell.primaryId="tracking";shell.secondaryId="predict_trajectory";render();return}
  if(id==="reprioritize_tracking"){shell.primaryId="tracking";shell.secondaryId="multi_track";render();return}
  if(id==="open_configuration_power"){shell.primaryId="configuration";shell.secondaryId="sensor_power";render();return}
  if(id==="open_configuration_resolution"){shell.primaryId="configuration";shell.secondaryId="default_resolution";render();return}
}
function renderStatus(){
  const sim=shell.sim,a=getArray(sim),tracked=sim.tracking.assignments;
  $("#persistent-status").innerHTML=
    '<section class="status-card"><h3>SISTEMA</h3><div class="status-line"><span>Escenario</span><strong>'+esc(sim.scenarioId)+'</strong></div><div class="status-line"><span>Potencia</span><strong>'+sim.power+' %</strong></div><div class="status-line"><span>Matriz</span><strong>'+esc(a?.id||"—")+'</strong></div><div class="status-line"><span>Interferencia</span><span class="status-value '+(effectivePenalty(sim)>28?"warn":"ok")+'">'+severityLabel(sim.interference.severity)+' · '+effectivePenalty(sim)+'</span></div></section>'+
    '<section class="status-card"><h3>OPERACIONES ACTIVAS</h3>'+activeOpsHtml()+'</section>'+
    '<section class="status-card"><h3>SEGUIMIENTO · '+trackingUsed(sim)+'/'+sim.tracking.capacity+'</h3>'+(tracked.length?tracked.map(x=>'<button class="status-link" data-track-contact="'+x.contactId+'">'+x.contactId+' · '+x.mode+' · '+x.priority+'</button>').join(""):'<div class="status-line"><span>Ninguno</span><span>—</span></div>')+'</section>'+
    '<section class="status-card"><h3>SOLICITUD A OPS</h3>'+(sim.powerRequest?'<div class="status-line"><span>'+esc(sim.powerRequest.state)+'</span><strong>+'+(sim.powerRequest.granted??sim.powerRequest.requested??0)+' %</strong></div>':'<div class="status-line"><span>Ninguna</span><span>—</span></div>')+'</section>'+
    '<section class="status-card"><h3>TRANSFERENCIAS</h3>'+(sim.transfers[0]?'<div class="status-line"><span>'+esc(sim.transfers[0].target.toUpperCase())+'</span><strong>'+esc(sim.transfers[0].contactId)+'</strong></div>':'<div class="status-line"><span>Ninguna</span><span>—</span></div>')+'</section>';
  document.querySelectorAll("[data-track-contact]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.trackContact;
    sim.selectedContactId=id;
    log("PERSISTENT TRACK OPEN "+id);
    emitTeacherEvent("PERSISTENT_TRACK_OPEN",{contactId:id});
    shell.primaryId="contacts";
    shell.secondaryId="all";
    render();
  });
}
function renderLog(){$("#log-list").innerHTML=shell.logs.map(x=>'<div class="log-entry">'+esc(x)+'</div>').join("")}
function currentExerciseLogLines(){
  const markerIndex=shell.logs.findIndex(line=>line.includes("RESET scenario · teacher:"));
  if(markerIndex<0)return [];
  return shell.logs.slice(0,markerIndex+1).reverse();
}
function currentExerciseLogText(){
  const panel=$("#teacher-panel"),lines=currentExerciseLogLines();
  if(!lines.length)return "";
  const id=panel?.dataset.tutorialId||"—";
  const title=panel?.dataset.tutorialTitle||"—";
  const level=panel?.dataset.tutorialLevel||"—";
  const scenario=panel?.dataset.scenarioId||shell.sim?.scenarioId||"—";
  return [
    "=== HOLOCUBIERTA · LOG DE EJERCICIO ===",
    "Práctica: "+id+" · "+title,
    "Nivel: "+level,
    "Escenario: "+scenario,
    "Exportado: "+new Date().toLocaleString("es-ES"),
    "----------------------------------------",
    ...lines,
    "=== FIN LOG DE EJERCICIO ==="
  ].join("\n");
}
async function copyCurrentExerciseLog(){
  const status=$("#copy-log-status"),text=currentExerciseLogText();
  if(!text){
    if(status)status.textContent="No hay ejercicio activo";
    return;
  }
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{
      const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();
    }
    if(status)status.textContent="✓ Log del ejercicio copiado";
    setTimeout(()=>{if(status)status.textContent=""},2200);
    log("DEV EXPORT · current exercise log copied");
  }catch(e){
    if(status)status.textContent="No se pudo copiar";
    console.error(e);
  }
}
window.SensorsConsoleV02={shell,log,render,renderWorkspace,renderStatus,resetScenario,navPrimary,navSecondary,contact,scenarioById,clearTimers};
load().catch(e=>{$("#workspace-content").innerHTML='<div class="danger-note">Error cargando Sensores: '+esc(e.message)+'</div>';console.error(e)});
