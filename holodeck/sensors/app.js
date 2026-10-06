import { initTeacherMode, emitTeacherEvent } from "./teacher_mode.js";
function initialContacts(){return [
  {id:"C-03",name:"Contacto 03",status:"identified",classification:"Lanzadera tipo 6",distance:"18.400 km",confidence:94,signal:"FUERTE",signature:"Warp / EM",tracked:true,marked:false},
  {id:"C-07",name:"Contacto 07",status:"unidentified",classification:"No identificado",distance:"43.000 km",confidence:22,signal:"MUY DÉBIL",signature:"Subespacial parcial",tracked:false,marked:true},
  {id:"C-12",name:"Contacto 12",status:"identified",classification:"Nave mercante",distance:"71.200 km",confidence:86,signal:"MEDIA",signature:"EM / térmica",tracked:true,marked:false},
  {id:"C-19",name:"Contacto 19",status:"lost",classification:"Desconocido",distance:"Última: 96.000 km",confidence:31,signal:"PERDIDA",signature:"Warp residual",tracked:false,marked:false}
]}
const state={
  model:null,context:null,interaction:null,powerContract:null,
  primaryId:"status",secondaryId:"general_status",special:null,
  power:72,basePower:72,interference:"BAJA",matrix:"PRINCIPAL",trackingCapacity:8,
  contacts:initialContacts(),
  selectedContactId:"C-07",activeOperations:[],results:[],powerRequest:null,logs:[]
};
const $=s=>document.querySelector(s);
const actionLabels={};
function log(msg){const t=new Date().toLocaleTimeString("es-ES",{hour12:false});state.logs.unshift(t+"  "+msg);renderLog()}
function actionDef(id){return state.context?.actions?.[id]||{display_es:id.replaceAll("_"," ")}}
function contact(){return state.contacts.find(c=>c.id===state.selectedContactId)}
async function load(){
  const [m,c,i,p]=await Promise.all([
    fetch("./data/sensor_menu_tree.json").then(r=>r.json()),
    fetch("./data/sensor_context_actions.json").then(r=>r.json()),
    fetch("./data/sensor_console_interaction_model.json").then(r=>r.json()),
    fetch("./data/sensor_to_operations_power_request.json").then(r=>r.json())
  ]);
  state.model=m;state.context=c;state.interaction=i;state.powerContract=p;
  bind();render();initTeacherMode({resetScenario});log("SIMULATOR READY · escenario SENSOR-LAB-01");
}
function bind(){
  $("#reset-sim").addEventListener("click",()=>resetScenario("manual"));
  $("#toggle-log").addEventListener("click",()=>{$("#log-panel").hidden=!$("#log-panel").hidden});
}
function resetScenario(source="teacher"){
  state.primaryId="status";state.secondaryId="general_status";state.special=null;
  state.power=72;state.basePower=72;state.interference="BAJA";state.matrix="PRINCIPAL";state.trackingCapacity=8;
  state.contacts=initialContacts();state.selectedContactId="C-07";state.activeOperations=[];state.results=[];state.powerRequest=null;
  log("RESET scenario · "+source);render();emitTeacherEvent("SCENARIO_RESET",{source});
}
function render(){renderPrimary();renderSecondary();renderWorkspace();renderStatus();renderLog()}
function primary(){return state.model.root.find(x=>x.id===state.primaryId)}
function secondary(){return primary()?.secondary?.find(x=>x.id===state.secondaryId)}
function navPrimary(id){
  state.primaryId=id;state.special=null;state.secondaryId=state.model.root.find(x=>x.id===id)?.secondary?.[0]?.id||null;log("OPEN "+id);emitTeacherEvent("NAV_PRIMARY",{primaryId:id});render()
}
function navSecondary(id){state.secondaryId=id;state.special=null;log("OPEN "+state.primaryId+"/"+id);emitTeacherEvent("NAV_SECONDARY",{primaryId:state.primaryId,secondaryId:id});render()}
function renderPrimary(){
  $("#primary-nav").innerHTML=state.model.root.map(x=>'<button class="primary-button '+(x.id===state.primaryId?"active":"")+'" data-p="'+x.id+'">'+x.display_es+'</button>').join("");
  document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>navPrimary(b.dataset.p));
}
function renderSecondary(){
  const p=primary();$("#workspace-kicker").textContent="SENSORES · "+(p?.display_es||"");
  $("#workspace-title").textContent=p?.display_es||"Sensores";
  const list=p?.secondary||[];
  $("#secondary-nav").innerHTML=list.length?list.map(x=>'<button class="secondary-button '+(x.id===state.secondaryId?"active":"")+'" data-s="'+x.id+'">'+x.display_es+'</button>').join(""):'<div class="notice">Sin submenús.</div>';
  document.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>navSecondary(b.dataset.s));
}
function datum(k,v){return '<div class="datum"><small>'+k+'</small><strong>'+v+'</strong></div>'}
function button(id,cls=""){const a=actionDef(id);return '<button class="action '+cls+'" data-action="'+id+'">'+a.display_es+'</button>'}
function wireActions(){document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>doAction(b.dataset.action))}
function renderWorkspace(){
  const box=$("#workspace-content");
  if(state.special==="power_request"){box.innerHTML=powerRequestView();wirePowerForm();return}
  if(state.primaryId==="contacts"){box.innerHTML=contactsView();wireContacts();wireActions();return}
  if(state.primaryId==="scans"){box.innerHTML=scanView();wireScanForm();wireActions();return}
  if(state.primaryId==="tracking"){box.innerHTML=trackingView();wireActions();return}
  if(state.primaryId==="sensor_readout"){box.innerHTML=readoutView();wireActions();return}
  if(state.primaryId==="results"){box.innerHTML=resultsView();wireActions();return}
  box.innerHTML=genericView();wireActions();
}
function genericView(){
  const s=secondary();if(!s)return '<div class="notice">Seleccione una función.</div>';
  const descriptions={
    general_status:"Resumen técnico de la instalación sensora.",
    available_arrays:"Matrices instaladas y su disponibilidad.",
    effective_range:"Capacidad de detección efectiva bajo las condiciones actuales.",
    available_resolution:"Resolución máxima efectiva actualmente disponible.",
    allocated_power:"Potencia actualmente asignada a Sensores.",
    integrity_damage:"Integridad y degradaciones de hardware.",
    detected_interference:"Interferencias que afectan a las lecturas.",
    active_operations:"Operaciones que continúan ejecutándose en segundo plano.",
    interference_status:"Interferencia detectada y efecto sobre el rendimiento.",
    sensor_power:"Distribución de la potencia ya asignada y solicitudes adicionales.",
    self_test:"Diagnóstico de la propia instalación sensora."
  };
  let shows=s.shows||s.tertiary?.shows||[];
  let actions=s.context_actions||s.tertiary?.context_actions||s.terminal_actions||s.tertiary?.terminal_actions||[];
  let body='<div class="card"><h3>'+s.display_es+'</h3><p>'+(descriptions[s.id]||"Función definida por el modelo autoritativo de Sensores.")+'</p>';
  if(s.id==="general_status")body+='<div class="data-grid">'+datum("Sistema","NOMINAL")+datum("Matriz",state.matrix)+datum("Potencia",state.power+" %")+datum("Interferencia",state.interference)+'</div>';
  else if(s.id==="allocated_power"||s.id==="sensor_power")body+='<div class="data-grid">'+datum("Asignada",state.power+" %")+datum("Base",state.basePower+" %")+datum("Solicitud",state.powerRequest?.state||"NINGUNA")+datum("Margen simulado",(100-state.power)+" %")+'</div>';
  else if(s.id==="effective_range")body+='<div class="data-grid">'+datum("Corto alcance","NOMINAL")+datum("Largo alcance",state.power<80?"LIMITADO":"AMPLIADO")+datum("Efecto potencia",state.power+" %")+datum("Entorno","Interferencia baja")+'</div>';
  else if(s.id==="detected_interference"||s.id==="interference_status")body+='<div class="data-grid">'+datum("Severidad",state.interference)+datum("Bandas afectadas","Subespacio")+datum("Origen","NO DETERMINADO")+datum("Confianza","61 %")+'</div>';
  else if(s.id==="active_operations")body+=activeOpsHtml();
  else body+='<div class="data-grid">'+shows.slice(0,6).map(x=>datum(x.replaceAll("_"," "),"DATOS DE SIMULACIÓN")).join("")+'</div>';
  if(actions.length)body+='<div class="action-grid">'+actions.map(a=>button(a)).join("")+'</div>';
  return body+'</div>';
}
function contactsView(){
  const s=secondary();let list=state.contacts;
  if(s?.id==="unidentified")list=list.filter(c=>c.status==="unidentified");
  if(s?.id==="identified")list=list.filter(c=>c.status==="identified");
  if(s?.id==="marked")list=list.filter(c=>c.marked);
  if(s?.id==="recently_lost")list=list.filter(c=>c.status==="lost");
  const c=contact();
  let h='<div class="card"><h3>'+s.display_es+'</h3><div class="contact-list">'+list.map(x=>'<div class="contact-row '+(x.id===state.selectedContactId?"active":"")+'" data-contact="'+x.id+'"><strong>'+x.id+'</strong><span>'+x.classification+'<br><small>'+x.signature+'</small></span><strong>'+x.confidence+'%</strong></div>').join("")+'</div></div>';
  if(c && list.some(x=>x.id===c.id)){
    h+='<div class="card"><h3>Ficha · '+c.name+'</h3><div class="data-grid">'+datum("Clasificación",c.classification)+datum("Distancia",c.distance)+datum("Firma",c.signature)+datum("Confianza",c.confidence+" %")+datum("Señal",c.signal)+datum("Seguimiento",c.tracked?"ACTIVO":"NO")+'</div><div class="action-grid">'+contactActions(c).map(a=>button(a)).join("")+'</div></div>';
  }
  return h;
}
function contactActions(c){
  if(c.status==="lost")return ["reacquire_contact","predict_trajectory","compare_readings","open_sensor_readout","request_additional_power"];
  const a=["focused_scan","open_sensor_readout","compare_readings","send_to_science"];
  a.push(c.tracked?"stop_tracking":"start_tracking");a.push(c.marked?"unmark_contact":"mark_contact");
  if(c.confidence<60)a.push("high_resolution_scan","request_additional_power");
  return a;
}
function wireContacts(){document.querySelectorAll("[data-contact]").forEach(el=>el.onclick=()=>{state.selectedContactId=el.dataset.contact;log("SELECT "+el.dataset.contact);emitTeacherEvent("SELECT_CONTACT",{contactId:el.dataset.contact});render()})}
function scanView(){
  const s=secondary();if(!s)return "";
  const c=contact();const focused=s.id==="focused";
  return '<div class="card"><h3>'+s.display_es+'</h3><p>Configure la operación. Cambiar de menú no la cancela una vez ejecutada.</p><div class="form-grid">'+
    fieldSelect("scan-mode","Modo",[["passive","Pasivo"],["active","Activo"]])+
    fieldSelect("target-scope","Área / objetivo",focused?[["known_contact",c?.id||"Contacto"]]:[["surrounding_space","Espacio circundante"],["sector","Sector 041"],["star_system","Sistema estelar"],["coordinates","Coordenadas"]])+
    fieldSelect("resolution","Resolución",[["general","General"],["standard","Estándar"],["high","Alta"]])+
    fieldSelect("priority","Prioridad",[["none","Ninguna"],["subspace","Subespacio"],["warp","Warp"],["biological","Biológica"]])+
    fieldSelect("duration","Duración",[["quick","Rápida"],["standard","Estándar"],["extended","Extendida"]])+
    fieldSelect("filters","Filtro principal",[["all","Todas"],["subspace","Subespacial"],["warp","Warp"],["thermal","Térmica"]])+
    '</div><div class="action-grid"><button id="execute-scan" class="action">Ejecutar barrido</button>'+button("request_additional_power","secondary")+'</div></div>';
}
function fieldSelect(id,label,opts){return '<div class="field"><label>'+label+'</label><select id="'+id+'">'+opts.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join("")+'</select></div>'}
function scanConfigSnapshot(){
  return {
    scanType:state.secondaryId,
    targetValue:$("#target-scope")?.value||"",
    targetLabel:$("#target-scope")?.selectedOptions?.[0]?.textContent||"",
    priority:$("#priority")?.value||"none",
    resolution:$("#resolution")?.value||"standard",
    mode:$("#scan-mode")?.value||"passive",
    duration:$("#duration")?.value||"standard",
    filters:$("#filters")?.value||"all",
    contactId:contact()?.id||null
  };
}
function wireScanForm(){
  const b=$("#execute-scan");if(b)b.onclick=executeScan;
  ["scan-mode","target-scope","resolution","priority","duration","filters"].forEach(id=>{
    const el=$("#"+id);
    if(el)el.addEventListener("change",()=>{
      const snapshot=scanConfigSnapshot();
      log("CONFIG "+id+"="+el.value);
      emitTeacherEvent("SCAN_CONFIG_CHANGE",{controlId:id,value:el.value,...snapshot});
    });
  });
}
function executeScan(){
  const cfg=scanConfigSnapshot();const type=state.secondaryId;const op={id:"SCN-"+String(Date.now()).slice(-4),type,progress:0,target:cfg.targetLabel||"—",targetValue:cfg.targetValue,resolution:cfg.resolution,priority:cfg.priority,mode:cfg.mode,duration:cfg.duration};
  state.activeOperations.push(op);log("EXECUTE scan "+type+" · "+op.target);emitTeacherEvent("SCAN_EXECUTE",{...cfg,target:op.target});renderStatus();
  const timer=setInterval(()=>{op.progress=Math.min(100,op.progress+10);renderStatus();if(op.progress>=100){clearInterval(timer);finishScan(op)}},350);
}
function finishScan(op){
  state.activeOperations=state.activeOperations.filter(x=>x!==op);
  const c=contact();if(c && (op.type==="focused"||op.target.includes(c.id))){const gain=state.power>=80?38:22;c.confidence=Math.min(99,c.confidence+gain);c.signal=c.confidence>60?"MEDIA":"DÉBIL"}
  state.results.unshift({id:op.id,time:new Date().toLocaleTimeString("es-ES",{hour12:false}),type:op.type,target:op.target,summary:c?"Confianza "+c.id+": "+c.confidence+" %":"Barrido completado"});
  log("COMPLETE "+op.id+" · result stored");emitTeacherEvent("SCAN_COMPLETE",{scanType:op.type,target:op.target,contactId:contact()?.id||null,resultId:op.id});render();
}
function trackingView(){
  const s=secondary();const c=contact();
  if(s.id==="tracked_contacts"){const tracked=state.contacts.filter(x=>x.tracked);return '<div class="card"><h3>Contactos seguidos</h3><div class="contact-list">'+tracked.map(x=>'<div class="contact-row" data-contact="'+x.id+'"><strong>'+x.id+'</strong><span>'+x.classification+'</span><strong>'+x.confidence+'%</strong></div>').join("")+'</div></div>'}
  return '<div class="card"><h3>'+s.display_es+'</h3><p>Contexto actual: '+c.id+' · '+c.classification+'</p><div class="data-grid">'+datum("Tracking",c.tracked?"ACTIVO":"NO")+datum("Capacidad",state.contacts.filter(x=>x.tracked).length+" / "+state.trackingCapacity)+'</div><div class="action-grid">'+(c.tracked?button("stop_tracking"):button("start_tracking"))+button("request_additional_power","secondary")+'</div></div>';
}
function readoutView(){
  const s=secondary(),c=contact();
  const val={signal_strength:c.signal,signature_type:c.signature,band_frequency:"4,7 THz / subespacio",energy_signature:"Parcial",subspace_signature:"Intermitente",approx_mass:"1,1 ×10⁶ t ±34%",approx_dimensions:"92–140 m",vector_velocity:"031 / +12 · 0,18c",detectable_lifeforms:"No concluyente",known_pattern_match:"41 %"}[s.id]||"Lectura";
  return '<div class="card"><h3>'+s.display_es+' · '+c.id+'</h3><div class="data-grid">'+datum("Valor",val)+datum("Confianza",c.confidence+" %")+datum("Procedencia","Sensores")+datum("Estado","OBSERVADO / ESTIMADO")+'</div><div class="action-grid">'+["focused_scan","compare_readings","send_to_science"].map(a=>button(a)).join("")+(c.confidence<60?button("request_additional_power","secondary"):"")+'</div></div>';
}
function resultsView(){
  const s=secondary();if(!state.results.length)return '<div class="notice">Todavía no hay resultados. Ejecute un barrido para probar este flujo.</div>';
  return '<div class="card"><h3>'+s.display_es+'</h3>'+state.results.map(r=>'<div class="contact-row"><strong>'+r.id+'</strong><span>'+r.target+'<br><small>'+r.summary+'</small></span><strong>'+r.time+'</strong></div>').join("")+'<div class="action-grid">'+button("repeat_operation")+button("compare_readings","secondary")+button("send_to_science","secondary")+'</div></div>';
}
function activeOpsHtml(){return state.activeOperations.length?state.activeOperations.map(o=>'<div class="datum"><small>'+o.id+' · '+o.type+'</small><strong>'+o.target+' · '+o.progress+'%</strong></div>').join(""):'<div class="notice">No hay operaciones activas.</div>'}
function powerRequestView(){
  return '<div class="card"><h3>Solicitar potencia adicional a Operaciones</h3><p>Sensores solicita capacidad. No elige qué sistema cede la energía.</p><div class="form-grid">'+
  '<div class="field"><label>Potencia actual</label><input value="'+state.power+' %" disabled></div>'+
  '<div class="field"><label>Incremento solicitado</label><select id="power-delta"><option value="5">+5 %</option><option value="10" selected>+10 %</option><option value="15">+15 %</option><option value="20">+20 %</option></select></div>'+
  '<div class="field"><label>Prioridad</label><select id="power-priority"><option>Operativa</option><option>Rutina</option><option>Urgente</option></select></div>'+
  '<div class="field"><label>Duración</label><select id="power-duration"><option>Una operación</option><option>Temporal</option><option>Hasta liberar</option></select></div>'+
  '</div><div class="action-grid"><button id="send-power" class="action">Enviar solicitud</button><button id="cancel-power" class="action secondary">Cancelar</button></div></div>';
}
function wirePowerForm(){
  $("#cancel-power").onclick=()=>{state.special=null;render()};
  $("#send-power").onclick=()=>{
    const delta=Number($("#power-delta").value);state.powerRequest={state:"PENDIENTE",requested:delta,granted:0};log("POWER REQUEST +"+delta+"% → OPS");emitTeacherEvent("POWER_REQUEST",{requestedDelta:delta,contactId:contact()?.id||null});state.special=null;render();
    setTimeout(()=>{const grant=Math.max(5,Math.floor(delta*.7));state.powerRequest={state:"APROBADA PARCIAL",requested:delta,granted:grant};state.power=Math.min(100,state.power+grant);log("OPS RESPONSE partial +"+grant+"%");emitTeacherEvent("POWER_RESPONSE",{state:"partially_approved",grantedDelta:grant});render()},900);
  }
}
function doAction(id){
  log("ACTION "+id);emitTeacherEvent("ACTION",{actionId:id,contactId:contact()?.id||null});
  if(id==="request_additional_power"){state.special="power_request";renderWorkspace();return}
  if(id==="focused_scan"||id==="high_resolution_scan"){state.primaryId="scans";state.secondaryId="focused";state.special=null;render();return}
  if(id==="start_tracking"){contact().tracked=true;emitTeacherEvent("TRACK_START",{contactId:contact().id});render();return}
  if(id==="stop_tracking"||id==="release_tracking_slot"){const idc=contact().id;contact().tracked=false;emitTeacherEvent("TRACK_STOP",{contactId:idc});render();return}
  if(id==="mark_contact"){contact().marked=true;render();return}
  if(id==="unmark_contact"){contact().marked=false;render();return}
  if(id==="open_sensor_readout"){state.primaryId="sensor_readout";state.secondaryId="signal_strength";emitTeacherEvent("READOUT_OPEN",{contactId:contact()?.id||null,readout:"signal_strength"});render();return}
  if(id==="compare_readings"){state.primaryId="results";state.secondaryId="compare_readings";render();return}
  if(id==="open_current_result"){state.primaryId="results";state.secondaryId="current_operation";render();return}
  if(id==="open_interference"||id==="automatic_compensation"||id==="manual_compensation"||id==="change_band"||id==="extend_integration"||id==="recover_signal"){state.primaryId="interference";state.secondaryId=id==="open_interference"?"interference_status":({automatic_compensation:"automatic_compensation",manual_compensation:"manual_adjustment",change_band:"change_band_frequency",extend_integration:"extend_integration",recover_signal:"recover_signal"}[id]);render();return}
  if(id==="open_diagnostics"||id==="run_self_test"){state.primaryId="diagnostics";state.secondaryId=id==="run_self_test"?"self_test":"array_status";render();return}
  if(id==="open_configuration_power"){state.primaryId="configuration";state.secondaryId="sensor_power";render();return}
  if(id==="open_configuration_resolution"){state.primaryId="configuration";state.secondaryId="default_resolution";render();return}
  if(id==="reacquire_contact"||id==="predict_trajectory"){state.primaryId="tracking";state.secondaryId=id==="reacquire_contact"?"reacquire_lost_contact":"predict_trajectory";render();return}
  if(id==="cancel_power_request"){state.powerRequest={state:"CANCELADA"};render();return}
  if(id==="cancel_operation"){state.activeOperations=[];render();return}
  if(id==="send_to_science"||id==="send_data"||id==="send_to_tactical"){emitTeacherEvent("HANDOFF",{target:id==="send_to_science"?"science":id==="send_to_tactical"?"tactical":"generic",contactId:contact()?.id||null});alert("Transferencia simulada: "+actionDef(id).display_es+"\n\nEn esta primera versión solo registramos el handoff.");return}
  alert("Acción registrada en el prototipo: "+actionDef(id).display_es);
}
function renderStatus(){
  const tracked=state.contacts.filter(x=>x.tracked);
  $("#persistent-status").innerHTML=
  '<section class="status-card"><h3>SISTEMA</h3><div class="status-line"><span>Estado</span><span class="status-value ok">NOMINAL</span></div><div class="status-line"><span>Potencia</span><strong>'+state.power+' %</strong></div><div class="status-line"><span>Matriz</span><strong>'+state.matrix+'</strong></div><div class="status-line"><span>Interferencia</span><span class="status-value warn">'+state.interference+'</span></div></section>'+
  '<section class="status-card"><h3>OPERACIONES ACTIVAS</h3>'+(state.activeOperations.length?state.activeOperations.map(o=>'<button class="status-link" data-status-route="results">'+o.id+' · '+o.progress+'%<div class="progress"><span style="width:'+o.progress+'%"></span></div></button>').join(""):'<div class="status-line"><span>Ninguna</span><span>—</span></div>')+'</section>'+
  '<section class="status-card"><h3>SEGUIMIENTO · '+tracked.length+'/'+state.trackingCapacity+'</h3>'+tracked.map(c=>'<button class="status-link" data-track-contact="'+c.id+'">'+c.id+' · '+c.confidence+'%</button>').join("")+'</section>'+
  '<section class="status-card"><h3>SOLICITUD A OPS</h3>'+(state.powerRequest?'<div class="status-line"><span>'+state.powerRequest.state+'</span><strong>+'+(state.powerRequest.granted||state.powerRequest.requested||0)+' %</strong></div>':'<div class="status-line"><span>Ninguna</span><span>—</span></div>')+'</section>';
  document.querySelectorAll("[data-track-contact]").forEach(b=>b.onclick=()=>{state.selectedContactId=b.dataset.trackContact;state.primaryId="contacts";state.secondaryId="all";render()});
  document.querySelectorAll("[data-status-route]").forEach(b=>b.onclick=()=>{state.primaryId="results";state.secondaryId="current_operation";render()});
}
function renderLog(){$("#log-list").innerHTML=state.logs.map(x=>'<div class="log-entry">'+x+'</div>').join("")}
load().catch(e=>{$("#workspace-content").innerHTML='<div class="danger-note">Error cargando el prototipo: '+e.message+'</div>';console.error(e)});
