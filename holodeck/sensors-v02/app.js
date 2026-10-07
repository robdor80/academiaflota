import {
  createSimulation,knownContacts,getContact,trackingUsed,effectivePenalty,
  createOperation,resolveScan,resolveSearch,startTracking,stopTracking,updateTracking,
  readout,applyInterference,runDiagnostic,makePowerResponse,transferData,compareReadings
} from "../sensors/sim_engine.js";

const COMPUTERS={
  pike:{
    name:"Computadora Constitution · 2259",era:"Perfil Pike / mediados del siglo XXIII",
    maxChain:1,inferContext:false,inferArea:false,proactive:false,
    caps:["Órdenes explícitas","Una operación por orden","Confirmación humana alta"],
    mode:"Automatiza procedimientos básicos, pero exige objetivo y parámetros claros."
  },
  kirk:{
    name:"Computadora Constitution · 2266",era:"Perfil Kirk / siglo XXIII",
    maxChain:2,inferContext:true,inferArea:false,proactive:false,
    caps:["Contexto básico","Secuencias cortas","Macros operativas"],
    mode:"Puede encadenar operaciones sencillas y reutilizar el contacto en contexto."
  },
  picard:{
    name:"Computadora Galaxy · 2364",era:"Perfil Picard / NCC-1701-D",
    maxChain:5,inferContext:true,inferArea:true,proactive:true,
    caps:["Lenguaje natural","Contexto operacional","Secuencias múltiples","Sugerencias proactivas"],
    mode:"Automatiza la preparación técnica y pregunta cuando hace falta una decisión del oficial."
  }
};

const state={
  scenarios:null,sim:null,view:"operate",computer:"picard",selectedContactId:null,
  logs:[],response:null,lastCommandContactId:null,busy:false
};
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const now=()=>new Date().toLocaleTimeString("es-ES",{hour12:false});
const currentComputer=()=>COMPUTERS[state.computer];
const contactById=id=>getContact(state.sim,id);
const selectedContact=()=>contactById(state.selectedContactId||state.sim.selectedContactId);
function log(msg){state.logs.unshift(now()+"  "+msg);renderLog()}
function reply(text,type="ok"){state.response={text,type};renderWorkspace()}
function scenarioById(id){return state.scenarios.scenarios.find(x=>x.id===id)||state.scenarios.scenarios[0]}
function contactIdFrom(text){
  const m=String(text).toUpperCase().match(/\bC-\d+\b/);
  if(m)return m[0];
  const c=currentComputer();
  if(c.inferContext)return state.lastCommandContactId||state.selectedContactId||state.sim.selectedContactId||null;
  return null;
}
function areaFrom(text){
  const m=norm(text).match(/sector\s*(\d{1,3})/);
  if(m)return "sector_"+m[1].padStart(3,"0");
  return currentComputer().inferArea?"sector_"+String(state.sim.sector||"041").padStart(3,"0"):null;
}
function targetLabel(area){return area&&area.startsWith("sector_")?"Sector "+area.split("_")[1]:"Espacio circundante"}

async function load(){
  state.scenarios=await fetch("../sensors/data/scenarios.json").then(r=>r.json());
  state.sim=createSimulation(state.scenarios.scenarios[0]);
  state.selectedContactId=state.sim.selectedContactId;
  $("#scenario-select").innerHTML=state.scenarios.scenarios.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("");
  $("#scenario-select").value=state.sim.scenarioId;
  $("#computer-select").value=state.computer;
  bind();
  render();
  log("SIMULATOR v0.2 READY · "+state.sim.scenarioTitle);
}
function bind(){
  $("#scenario-select").addEventListener("change",()=>resetScenario($("#scenario-select").value));
  $("#computer-select").addEventListener("change",()=>{state.computer=$("#computer-select").value;log("COMPUTER PROFILE "+state.computer.toUpperCase());render()});
  $("#reset-sim").addEventListener("click",()=>resetScenario(state.sim.scenarioId));
  $("#toggle-log").addEventListener("click",()=>{$("#log-panel").hidden=!$("#log-panel").hidden});
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));
}
function resetScenario(id){
  state.sim=createSimulation(scenarioById(id));
  state.selectedContactId=state.sim.selectedContactId;
  state.lastCommandContactId=null;state.response=null;state.busy=false;
  $("#scenario-select").value=state.sim.scenarioId;
  log("RESET scenario · "+state.sim.scenarioId);
  render();
}
function render(){
  renderComputer();
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  const titles={
    operate:["SENSORES · OPERAR","Asistencia de la computadora"],
    contacts:["SENSORES · CONTACTOS","Contactos"],
    tracking:["SENSORES · SEGUIMIENTO","Seguimiento"],
    results:["SENSORES · RESULTADOS","Resultados e historial"],
    advanced:["SENSORES · AVANZADO","Control manual"]
  };
  $("#workspace-kicker").textContent=titles[state.view][0];
  $("#workspace-title").textContent=titles[state.view][1];
  renderWorkspace();renderStatus();renderLog();
}
function renderComputer(){
  const c=currentComputer();
  $("#computer-name").textContent=c.name;
  $("#computer-era").textContent=c.era;
  $("#computer-capabilities").innerHTML=c.caps.map(x=>'<span class="capability">'+esc(x)+'</span>').join("");
  $("#computer-mode").textContent=c.mode;
}
function datum(k,v){return '<div class="datum"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>'}
function responseHtml(){
  if(!state.response)return "";
  return '<div class="computer-response '+esc(state.response.type)+'"><strong>COMPUTADORA:</strong> '+esc(state.response.text)+'</div>';
}
function renderWorkspace(){
  const box=$("#workspace-content");
  if(state.view==="operate")box.innerHTML=operateView();
  if(state.view==="contacts")box.innerHTML=contactsView();
  if(state.view==="tracking")box.innerHTML=trackingView();
  if(state.view==="results")box.innerHTML=resultsView();
  if(state.view==="advanced")box.innerHTML=advancedView();
  wireWorkspace();
}
function operateView(){
  const c=selectedContact();
  const suggestions=[
    "Barrido de largo alcance del sector 041, prioridad subespacio",
    "Buscar firma warp en el sector 041",
    c?"Barrido focalizado sobre "+c.id:"",
    c?"Mantén seguimiento prioritario de "+c.id:"",
    c?"Envía "+c.id+" a Ciencia":""
  ].filter(Boolean);
  let html='<div class="card command-card"><h3>Dar una orden a la computadora</h3><p>Describe el objetivo. La computadora resolverá los pasos técnicos que pueda automatizar según la época seleccionada.</p>'+
    '<div class="command-row"><input id="computer-command" placeholder="Ej.: Sigue la firma warp de C-43 con prioridad alta"><button id="execute-command" class="action">Ejecutar orden</button></div>'+
    '<div class="suggestion-row">'+suggestions.map(x=>'<button class="suggestion" data-command="'+esc(x)+'">'+esc(x)+'</button>').join("")+'</div>'+responseHtml()+'</div>';
  if(c){
    html+='<div class="card"><h3>Contexto actual · '+esc(c.id)+'</h3><div class="context-grid">'+
      datum("Clasificación",c.classification)+datum("Confianza",Math.round(c.confidence)+" %")+
      datum("Firmas",(c.signatures||[]).join(" · ")||"—")+datum("Seguimiento",c.tracked?(c.trackingMode+" / "+c.trackingPriority):"No")+
      '</div><div class="action-grid">'+
      smart("focused","Barrido focalizado")+smart("hires","Alta resolución")+smart(c.tracked?"untrack":"track",c.tracked?"Finalizar seguimiento":"Seguir")+
      ((c.signatures||[]).some(x=>x.includes("warp"))?smart("signature","Seguir firma warp"):"")+
      smart("science","Enviar a Ciencia")+smart("mark",c.marked?"Quitar marca":"Marcar")+
      smart("evaluate","Pedir recomendación","secondary")+'</div></div>';
  }
  html+='<div class="card"><h3>Qué cambia con esta v0.2</h3><p>Las funciones técnicas siguen existiendo, pero dejan de ser la ruta principal. La computadora puede encadenar preparación, configuración y ejecución; el oficial interviene cuando hay que decidir objetivo, prioridad, recursos o autorizaciones.</p></div>';
  return html;
}
function smart(id,label,cls=""){return '<button class="action '+cls+'" data-smart="'+id+'">'+esc(label)+'</button>'}
function contactsView(){
  const list=knownContacts(state.sim);
  let html='<div class="card"><h3>Contactos conocidos</h3><div class="contact-list">'+list.map(c=>
    '<div class="contact-row '+(c.id===state.selectedContactId?"active":"")+'" data-contact="'+c.id+'"><strong>'+c.id+'</strong><span>'+esc(c.classification)+'<br><small>'+esc((c.signatures||[]).join(" · "))+'</small></span><strong>'+Math.round(c.confidence)+'%</strong></div>'
  ).join("")+'</div></div>';
  const c=selectedContact();
  if(c)html+='<div class="card"><h3>'+c.id+' · acciones contextuales</h3><div class="data-grid">'+datum("Estado",c.status)+datum("Distancia",c.distanceKm.toLocaleString("es-ES")+" km")+datum("Vector",c.vector)+datum("Velocidad",c.velocity)+'</div><div class="action-grid">'+
    smart("focused","Barrido focalizado")+smart("hires","Alta resolución")+smart(c.tracked?"untrack":"track",c.tracked?"Finalizar seguimiento":"Seguir")+smart("science","Enviar a Ciencia")+smart("evaluate","Pedir recomendación","secondary")+'</div></div>';
  return html;
}
function trackingView(){
  const used=trackingUsed(state.sim),cap=state.sim.tracking.capacity;
  const rows=state.sim.tracking.assignments.map(a=>{
    const c=contactById(a.contactId);
    return '<div class="result-row"><strong>'+a.contactId+' · '+esc(c?.classification||"—")+'</strong><small>'+esc(a.mode)+' · '+esc(a.priority)+' · calidad '+Math.round(a.quality)+'%</small></div>';
  }).join("");
  return '<div class="card"><h3>Seguimiento · '+used+' / '+cap+'</h3><p>La computadora muestra la ocupación y puede ejecutar órdenes de redistribución, pero no decide por sí sola qué contacto sacrificar cuando existe conflicto.</p>'+ (rows||'<p>No hay seguimientos activos.</p>')+
    '<div class="action-grid"><button class="action secondary" data-smart="tracking_advice">Pedir recomendación</button></div></div>'+responseHtml();
}
function resultsView(){
  const rows=state.sim.results.map(r=>'<div class="result-row"><strong>'+esc(r.id)+' · '+esc(r.type)+' / '+esc(r.subtype)+'</strong><small>'+esc(r.target)+' · '+esc(r.summary)+'</small></div>').join("");
  return '<div class="card"><h3>Resultados e historial</h3>'+(rows||'<p>Aún no hay resultados.</p>')+
    '<div class="action-grid"><button class="action secondary" data-smart="compare_last">Comparar dos últimos</button></div></div>'+responseHtml();
}
function advancedView(){
  return '<div class="advanced-note"><strong>Control manual completo conservado</strong><p>La v0.2 no elimina ninguna capacidad del motor. Para diagnóstico, entrenamiento académico, averías o control fino puedes seguir entrando en la consola v0.1, donde están expuestos todos los parámetros.</p><a class="advanced-link" href="../sensors/">Abrir consola manual v0.1 →</a></div>'+
  '<div class="card"><h3>Principio de diseño</h3><p><strong>Computadora:</strong> prepara, configura, calcula y ejecuta rutinas. <strong>Oficial:</strong> decide intención, objetivo, prioridad, excepciones y conflictos de recursos.</p></div>';
}
function wireWorkspace(){
  const input=$("#computer-command"),go=$("#execute-command");
  if(go&&input){
    go.onclick=()=>executeNaturalCommand(input.value);
    input.onkeydown=e=>{if(e.key==="Enter")executeNaturalCommand(input.value)};
  }
  document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>{const input=$("#computer-command");if(input)input.value=b.dataset.command;executeNaturalCommand(b.dataset.command)});
  document.querySelectorAll("[data-contact]").forEach(el=>el.onclick=()=>{state.selectedContactId=el.dataset.contact;state.sim.selectedContactId=el.dataset.contact;state.lastCommandContactId=el.dataset.contact;log("SELECT "+el.dataset.contact);render()});
  document.querySelectorAll("[data-smart]").forEach(b=>b.onclick=()=>runSmart(b.dataset.smart));
}
function parseClauses(raw){
  const c=currentComputer(),text=String(raw||"").trim();
  if(!text)return [];
  const clauses=text.split(/\s*(?:,|;|\by luego\b|\bdespués\b|\bdespues\b|\by después\b|\by despues\b)\s*/i).filter(Boolean);
  if(clauses.length>c.maxChain)return {error:"Esta computadora admite como máximo "+c.maxChain+" operación"+(c.maxChain===1?"":"es")+" encadenada"+(c.maxChain===1?"":"s")+". Divide la orden."};
  return clauses;
}
function executeNaturalCommand(raw){
  const parsed=parseClauses(raw);
  if(parsed.error){reply(parsed.error,"warn");return}
  if(!parsed.length){reply("Indique una orden operacional.","warn");return}
  state.response=null;
  let messages=[],ok=true;
  for(const clause of parsed){
    const r=executeClause(clause);
    messages.push(r.text);if(!r.ok)ok=false;
    if(!r.ok&&currentComputer().maxChain===1)break;
  }
  reply(messages.join(" " ),ok?"ok":"warn");
}
function executeClause(raw){
  const t=norm(raw),cid=contactIdFrom(raw),area=areaFrom(raw);
  if(/\b(finaliza|deten|libera|deja de seguir|quita seguimiento)\b/.test(t)){
    if(!cid)return failNeedContact();
    stopTracking(state.sim,cid);state.lastCommandContactId=cid;log("COMPUTER TRACK STOP "+cid);render();
    return {ok:true,text:"Seguimiento de "+cid+" finalizado."};
  }
  if(/\b(seguir|sigue|seguimiento|manten)\b/.test(t)){
    if(!cid)return failNeedContact();
    const signature=/firma|warp/.test(t)?"warp":null;
    const mode=signature?"signature":"normal";
    const priority=/prioridad|prioritario|alta/.test(t)?"priority":"normal";
    const r=startTracking(state.sim,cid,mode,priority,signature);
    if(!r.ok)return {ok:false,text:r.reason+". Debe decidir qué recurso liberar o reducir."};
    state.lastCommandContactId=cid;log("COMPUTER TRACK "+cid+" · "+mode+" · "+priority);render();
    return {ok:true,text:"Seguimiento "+(signature?"de firma warp ":"")+"establecido sobre "+cid+(priority==="priority"?" con prioridad alta.":".")};
  }
  if(/\b(barrido|escaneo|escanea)\b/.test(t)){
    if(/focal/.test(t)||cid){
      if(!cid)return failNeedContact();
      const cfg={scanType:"focused",mode:"passive",targetValue:cid,targetLabel:"Contacto "+cid,contactId:cid,resolution:/alta resolucion|alta resolución|high/.test(raw)?"high":"standard",priority:"none",duration:"standard",filters:["all"]};
      state.lastCommandContactId=cid;startScan(cfg);return {ok:true,text:"Barrido focalizado iniciado sobre "+cid+"."};
    }
    if(/largo alcance/.test(t)){
      if(!area)return {ok:false,text:"Necesito un área u objetivo explícito para el barrido."};
      const priority=/subespac/.test(t)?"subspace":"none";
      const cfg={scanType:"long_range",mode:"passive",targetValue:area,targetLabel:targetLabel(area),contactId:null,resolution:"standard",priority,duration:"standard",filters:priority==="subspace"?["subspace","warp"]:["all"]};
      startScan(cfg);return {ok:true,text:"Barrido de largo alcance iniciado sobre "+targetLabel(area)+(priority==="subspace"?", priorizando emisiones subespaciales.":".")};
    }
  }
  if(/\b(busca|buscar|localiza|localizar|rastrea)\b/.test(t)){
    if(!area)return {ok:false,text:"Necesito el área de búsqueda."};
    let searchType=null;
    if(/lanzadera/.test(t))searchType="shuttle";
    else if(/firma warp|warp/.test(t))searchType="warp_signature";
    else if(/transpondedor|baliza|senal|señal/.test(raw.toLowerCase()))searchType="signal_transponder";
    else if(/vida|forma de vida/.test(t))searchType="lifeform";
    if(!searchType)return {ok:false,text:"Indique qué clase de firma u objetivo desea localizar."};
    const cfg={searchType,area,sensitivity:/alta|maxima|maxima/.test(t)?"high":"standard",resolution:"standard",criteria:"",duration:"standard"};
    startSearch(cfg);return {ok:true,text:"Búsqueda iniciada en "+targetLabel(area)+"."};
  }
  if(/\b(enviar|envia|remite|transfiere)\b/.test(t)&&/ciencia/.test(t)){
    if(!cid)return failNeedContact();
    transferData(state.sim,"SCIENCE",cid,{source:"computer_assist"});
    state.lastCommandContactId=cid;log("COMPUTER TRANSFER "+cid+" → SCIENCE");render();
    return {ok:true,text:"Datos de "+cid+" enviados a Ciencia."};
  }
  if(/\b(marca|marcar)\b/.test(t)){
    if(!cid)return failNeedContact();
    const c=contactById(cid);if(!c)return {ok:false,text:"No existe el contacto "+cid+"."};
    c.marked=true;state.lastCommandContactId=cid;log("COMPUTER MARK "+cid);render();
    return {ok:true,text:cid+" marcado como relevante."};
  }
  if(/\b(desmarca|quita marca)\b/.test(t)){
    if(!cid)return failNeedContact();
    const c=contactById(cid);if(!c)return {ok:false,text:"No existe el contacto "+cid+"."};
    c.marked=false;log("COMPUTER UNMARK "+cid);render();return {ok:true,text:"Marca retirada de "+cid+"."};
  }
  if(/\b(potencia)\b/.test(t)&&/\b(solicita|solicitar|pide|pedir)\b/.test(t)){
    const n=Number((t.match(/(\d{1,2})\s*%?/)||[])[1]||10);
    const req={requested:n,priority:/urgente/.test(t)?"Urgente":"Operativa",duration:"single_operation"};
    state.sim.powerRequest={...req,state:"PENDIENTE"};const ans=makePowerResponse(state.sim,req);Object.assign(state.sim.powerRequest,ans);
    log("COMPUTER POWER REQUEST +"+n+"% → OPS · "+ans.state+" +"+ans.granted+"%");render();
    return {ok:true,text:"Solicitud enviada a Operaciones. Respuesta: "+ans.state+", +"+ans.granted+"%."};
  }
  if(/\b(compensa|compensar)\b/.test(t)&&/interferencia/.test(t)){
    const r=applyInterference(state.sim,"automatic");log("COMPUTER INTERFERENCE AUTO");render();return {ok:true,text:r.message+"."};
  }
  if(/\b(diagnostico|diagnóstico|autotest|auto test)\b/.test(raw.toLowerCase())){
    const r=runDiagnostic(state.sim,"all");log("COMPUTER DIAGNOSTIC "+r.id+" · "+r.status);render();return {ok:true,text:"Diagnóstico "+r.status+". Incidencias: "+r.issues.length+"."};
  }
  if(/\b(estado|informe)\b/.test(t)){
    return {ok:true,text:"Sensores "+(effectivePenalty(state.sim)>25?"degradados":"operativos")+". Potencia "+state.sim.power+"%. Seguimiento "+trackingUsed(state.sim)+"/"+state.sim.tracking.capacity+"."};
  }
  return {ok:false,text:"No he podido convertir esa frase en una operación segura. Reformule indicando acción, objetivo y prioridad."};
}
function failNeedContact(){return {ok:false,text:"Necesito identificar el contacto. Indique un ID como C-43."}}
function startScan(cfg){
  const op=createOperation(state.sim,"scan:"+cfg.scanType,cfg);state.busy=true;log("COMPUTER EXECUTE scan "+cfg.scanType+" · "+cfg.targetLabel);render();
  setTimeout(()=>{const r=resolveScan(state.sim,op);state.busy=false;log("COMPLETE "+r.id+" · "+r.summary);state.response={text:"Operación "+r.id+" completada: "+r.summary,type:"ok"};render()},850);
}
function startSearch(cfg){
  const op=createOperation(state.sim,"search:"+cfg.searchType,cfg);state.busy=true;log("COMPUTER EXECUTE search "+cfg.searchType+" · "+cfg.area);render();
  setTimeout(()=>{const r=resolveSearch(state.sim,cfg,op.id);op.state="completed";op.progress=100;state.busy=false;log("COMPLETE "+r.id+" · "+r.summary);state.response={text:"Búsqueda "+r.id+" completada: "+r.summary,type:"ok"};render()},850);
}
function runSmart(id){
  const c=selectedContact();
  if(id==="focused"&&c){executeNaturalCommand("Barrido focalizado sobre "+c.id);return}
  if(id==="hires"&&c){
    const cfg={scanType:"focused",mode:"passive",targetValue:c.id,targetLabel:"Contacto "+c.id,contactId:c.id,resolution:"high",priority:"none",duration:"standard",filters:["all"]};
    startScan(cfg);reply("Barrido de alta resolución iniciado sobre "+c.id+".","ok");return;
  }
  if(id==="track"&&c){executeNaturalCommand("Sigue "+c.id);return}
  if(id==="untrack"&&c){executeNaturalCommand("Finaliza seguimiento "+c.id);return}
  if(id==="signature"&&c){executeNaturalCommand("Mantén seguimiento prioritario de la firma warp de "+c.id);return}
  if(id==="science"&&c){executeNaturalCommand("Envía "+c.id+" a Ciencia");return}
  if(id==="mark"&&c){if(c.marked){c.marked=false;log("UNMARK "+c.id);reply("Marca retirada de "+c.id+".","ok");render()}else executeNaturalCommand("Marca "+c.id);return}
  if(id==="evaluate"&&c){
    const advice=evaluateContact(c);reply(advice,"ok");return;
  }
  if(id==="tracking_advice"){
    const used=trackingUsed(state.sim),cap=state.sim.tracking.capacity;
    if(used<cap)reply("Quedan "+(cap-used)+" unidades de capacidad. No es necesario liberar seguimiento.","ok");
    else{
      const options=state.sim.tracking.assignments.map(a=>({id:a.contactId,q:a.quality,priority:a.priority})).sort((a,b)=>a.q-b.q);
      reply("Capacidad agotada. Candidato técnico para revisión: "+(options[0]?.id||"ninguno")+". La decisión de liberarlo corresponde al oficial.","warn");
    }
    return;
  }
  if(id==="compare_last"){
    if(state.sim.results.length<2){reply("Se necesitan al menos dos resultados.","warn");return}
    const a=state.sim.results[0],b=state.sim.results[1],r=compareReadings(state.sim,a.id,b.id);
    if(r.ok){log("COMPUTER COMPARE "+a.id+" ↔ "+b.id);reply(r.comparison.summary,"ok")}else reply(r.reason,"warn");
  }
}
function evaluateContact(c){
  if(c.status==="lost")return c.id+" está perdido. Recomiendo intentar recuperación de señal antes de otras acciones.";
  if(c.confidence<60)return c.id+" tiene confianza baja ("+Math.round(c.confidence)+"%). Recomiendo barrido focalizado o alta resolución.";
  if(!c.tracked&&((c.signatures||[]).includes("warp")||(c.signatures||[]).includes("subspace")))return c.id+" presenta firma relevante y no está seguido. Recomiendo establecer seguimiento antes de continuar.";
  if(c.confidence>=80)return c.id+" tiene una lectura estable. Puede transferirse a Ciencia o mantenerse seguimiento según misión.";
  return c.id+" tiene confianza intermedia. Recomiendo conservar seguimiento y mejorar lectura si la misión exige identificación.";
}
function renderStatus(){
  const sim=state.sim;if(!sim)return;
  const used=trackingUsed(sim),c=selectedContact();
  $("#persistent-status").innerHTML=
    '<div class="status-card"><h3>SISTEMA</h3>'+
    line("Escenario",sim.scenarioId)+line("Potencia",sim.power+" %",sim.power<65?"warn":"ok")+line("Matriz",sim.activeArray)+line("Interferencia",effectivePenalty(sim)+" pts",effectivePenalty(sim)>25?"warn":"ok")+'</div>'+
    '<div class="status-card"><h3>SEGUIMIENTO · '+used+'/'+sim.tracking.capacity+'</h3>'+
    (sim.tracking.assignments.map(a=>'<div class="track-line">'+esc(a.contactId)+' · '+esc(a.mode)+' · '+esc(a.priority)+'</div>').join("")||'<div class="track-line">Ninguno</div>')+'</div>'+
    '<div class="status-card"><h3>CONTEXTO</h3>'+
    (c?line("Contacto",c.id)+line("Confianza",Math.round(c.confidence)+" %")+line("Estado",c.status):'<div class="status-line">Sin contacto</div>')+'</div>'+
    '<div class="status-card"><h3>COMPUTADORA</h3>'+line("Perfil",state.computer.toUpperCase())+line("Estado",state.busy?"EJECUTANDO":"LISTA",state.busy?"warn":"ok")+'</div>';
}
function line(k,v,cls=""){return '<div class="status-line"><span>'+esc(k)+'</span><strong class="status-value '+cls+'">'+esc(v)+'</strong></div>'}
function renderLog(){const box=$("#log-list");if(box)box.innerHTML=state.logs.map(x=>'<div class="log-entry">'+esc(x)+'</div>').join("")}

load();
