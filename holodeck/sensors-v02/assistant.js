import {createOperation,resolveScan,resolveSearch,startTracking,stopTracking,updateTracking,applyInterference,runDiagnostic,makePowerResponse,transferData,saveReading,compareReadings,trackingUsed,effectivePenalty,getContact} from "./sim_engine.js";
import {emitTeacherEvent} from "./teacher_mode.js";

const PROFILES={
  pike:{name:"Constitution 2259 · Pike",era:"Asistencia limitada",maxChain:1,inferContact:false,inferArea:false,caps:["Órdenes explícitas","1 operación por orden","Confirmación alta"]},
  kirk:{name:"Constitution 2266 · Kirk",era:"Contexto básico",maxChain:2,inferContact:true,inferArea:false,caps:["Contexto básico","Secuencias cortas","Macros operativas"]},
  picard:{name:"Galaxy 2364 · Picard",era:"Asistencia contextual avanzada",maxChain:5,inferContact:true,inferArea:true,caps:["Lenguaje natural","Contexto operacional","Secuencias múltiples","Sugerencias"]}
};
let profile="picard",lastContact=null,busy=false;
const $=s=>document.querySelector(s),norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const bridge=()=>window.SensorsConsoleV02,sim=()=>bridge()?.shell?.sim,comp=()=>PROFILES[profile];
function say(text,type="ok"){const e=$("#computer-response-v02");if(!e)return;e.hidden=false;e.className="computer-response-v02 "+type;e.textContent="COMPUTADORA: "+text}
function log(t){bridge()?.log("COMPUTER · "+t)}
function tev(type,data={}){emitTeacherEvent(type,data)}
function repaint(){bridge()?.render();renderAssistant()}
function cid(raw){const m=String(raw).toUpperCase().match(/\bC-\d+\b/);if(m)return m[0];return comp().inferContact?(lastContact||sim()?.selectedContactId||null):null}
function area(raw){const m=norm(raw).match(/sector\s*(\d{1,3})/);if(m)return "sector_"+m[1].padStart(3,"0");return comp().inferArea&&sim()?"sector_"+String(sim().sector||"041").padStart(3,"0"):null}
function areaLabel(a){return a?.startsWith("sector_")?"Sector "+a.split("_")[1]:"Espacio circundante"}
function selected(){const s=sim();return s?getContact(s,lastContact||s.selectedContactId):null}
function renderAssistant(){
  if(!$("#computer-assistant-v02"))return;
  const p=comp();$("#computer-name-v02").textContent=p.name;$("#computer-era-v02").textContent=p.era;
  $("#computer-caps-v02").innerHTML=p.caps.map(x=>'<span class="computer-cap-v02">'+x+'</span>').join("");
  const c=selected(),sugs=["Barrido de largo alcance del sector 041, prioridad subespacio","Buscar firma warp en el sector 041",c?"Barrido focalizado sobre "+c.id:"",c?"Mantén seguimiento prioritario de la firma warp de "+c.id:"",c?"Envía "+c.id+" a Ciencia":""].filter(Boolean);
  $("#computer-suggestions-v02").innerHTML=sugs.map(x=>'<button class="computer-suggestion-v02" data-v02-command="'+x.replace(/"/g,"&quot;")+'">'+x+'</button>').join("");
  document.querySelectorAll("[data-v02-command]").forEach(b=>b.onclick=()=>{$("#computer-command-v02").value=b.dataset.v02Command;execute(b.dataset.v02Command)});
  const teacher=$("#mode-select")?.value==="teacher",teacherReady=!teacher||!$("#teacher-order-summary")?.hidden;$("#computer-command-v02").disabled=!teacherReady||busy;$("#computer-run-v02").disabled=!teacherReady||busy;
  if(teacher&&!teacherReady)say("Reciba primero la orden del instructor. Después podrá operar normalmente con la computadora de a bordo.","warn");
}
function parts(raw){const p=String(raw||"").trim().split(/\s*(?:;|\by luego\b|\by después\b|\by despues\b|\bdespués\b|\bdespues\b)\s*/i).filter(Boolean);return p.length>comp().maxChain?{error:"Esta computadora admite como máximo "+comp().maxChain+" operación(es) encadenada(s)."}:p}
function execute(raw){
  if($("#mode-select")?.value==="teacher"&&$("#teacher-order-summary")?.hidden){say("Reciba primero la orden del instructor.","warn");return}
  const ps=parts(raw);if(ps.error){say(ps.error,"warn");return}if(!ps.length){say("Indique una orden operacional.","warn");return}
  const msgs=[];let ok=true;for(const p of ps){const r=one(p);msgs.push(r.text);ok=ok&&r.ok}say(msgs.join(" "),ok?"ok":"warn")
}
function one(raw){
  const s=sim(),t=norm(raw),cId=cid(raw),a=area(raw);if(!s)return {ok:false,text:"La consola aún no está lista."};
  if(/\b(finaliza|deten|libera|deja de seguir|quita seguimiento)\b/.test(t)){if(!cId)return need();stopTracking(s,cId);lastContact=cId;log("TRACK STOP "+cId);tev("TRACK_STOP",{contactId:cId});repaint();return {ok:true,text:"Seguimiento de "+cId+" finalizado."}}
  if(/\b(seguir|sigue|seguimiento|manten)\b/.test(t)){if(!cId)return need();const sig=/firma|warp/.test(t)?"warp":null,mode=sig?"signature":"normal",pri=/prioridad|prioritario|alta/.test(t)?"priority":"normal",r=startTracking(s,cId,mode,pri,sig);if(!r.ok)return {ok:false,text:r.reason+". Debe decidir qué recurso liberar."};lastContact=cId;s.selectedContactId=cId;log("TRACK "+cId+" · "+mode+" · "+pri);if(sig){tev("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"track_signature"});tev("TRACK_SIGNATURE",{contactId:cId,signature:sig})}else tev("TRACK_START",{contactId:cId});if(pri==="priority")tev("TRACK_PRIORITY",{contactId:cId,priority:"priority"});repaint();return {ok:true,text:"Seguimiento "+(sig?"de firma warp ":"")+"establecido sobre "+cId+(pri==="priority"?" con prioridad alta.":".")}}
  if(/\b(barrido|escaneo|escanea)\b/.test(t)){
    if(/focal/.test(t)||cId){if(!cId)return need();runScan({scanType:"focused",mode:/activo/.test(t)?"active":"passive",targetValue:cId,targetLabel:"Contacto "+cId,contactId:cId,resolution:/alta resolucion|alta resolución/.test(raw.toLowerCase())?"high":"standard",priority:"none",duration:/extendid/.test(t)?"extended":"standard",filters:["all"]});lastContact=cId;return {ok:true,text:"Barrido focalizado iniciado sobre "+cId+"."}}
    if(/largo alcance/.test(t)){if(!a)return {ok:false,text:"Necesito un área u objetivo explícito."};const pri=/subespac/.test(t)?"subspace":"none";runScan({scanType:"long_range",mode:/activo/.test(t)?"active":"passive",targetValue:a,targetLabel:areaLabel(a),contactId:null,resolution:/alta resolucion|alta resolución/.test(raw.toLowerCase())?"high":"standard",priority:pri,duration:/extendid/.test(t)?"extended":"standard",filters:pri==="subspace"?["subspace","warp"]:["all"]});return {ok:true,text:"Barrido de largo alcance iniciado sobre "+areaLabel(a)+"."}}
    if(/corto alcance/.test(t)){runScan({scanType:"short_range",mode:"passive",targetValue:a||"local",targetLabel:areaLabel(a||"local"),contactId:null,resolution:"standard",priority:"none",duration:"standard",filters:["all"]});return {ok:true,text:"Barrido de corto alcance iniciado."}}
  }
  if(/\b(busca|buscar|localiza|localizar|rastrea)\b/.test(t)){if(!a)return {ok:false,text:"Necesito el área de búsqueda."};let st=/lanzadera/.test(t)?"shuttle":/firma warp|warp/.test(t)?"warp_signature":/transpondedor|baliza|senal|señal/.test(raw.toLowerCase())?"signal_transponder":/vida|forma de vida/.test(t)?"lifeform":/nave/.test(t)?"starship":/energia|energía/.test(raw.toLowerCase())?"energy_source":/subespac/.test(t)?"subspace_emission":null;if(!st)return {ok:false,text:"Indique qué clase de firma u objetivo desea localizar."};runSearch({searchType:st,area:a,sensitivity:/alta|maxima|máxima/.test(raw.toLowerCase())?"high":"standard",resolution:"standard",criteria:"",duration:"standard"});return {ok:true,text:"Búsqueda iniciada en "+areaLabel(a)+"."}}
  if(/\b(enviar|envia|remite|transfiere)\b/.test(t)&&/ciencia/.test(t)){if(!cId)return need();transferData(s,"SCIENCE",cId,{source:"computer_v02"});lastContact=cId;log("TRANSFER "+cId+" → SCIENCE");tev("HANDOFF",{target:"science",contactId:cId});repaint();return {ok:true,text:"Datos de "+cId+" enviados a Ciencia."}}
  if(/\b(marca|marcar)\b/.test(t)&&!/\bdesmarca\b/.test(t)){if(!cId)return need();const c=getContact(s,cId);if(!c)return {ok:false,text:"Contacto inexistente."};c.marked=true;lastContact=cId;log("MARK "+cId);tev("CONTACT_MARK",{contactId:cId,marked:true});repaint();return {ok:true,text:cId+" marcado como relevante."}}
  if(/\b(desmarca|quita marca)\b/.test(t)){if(!cId)return need();const c=getContact(s,cId);if(!c)return {ok:false,text:"Contacto inexistente."};c.marked=false;log("UNMARK "+cId);repaint();return {ok:true,text:"Marca retirada de "+cId+"."}}
  if(/\b(potencia)\b/.test(t)&&/\b(solicita|solicitar|pide|pedir)\b/.test(t)){const n=Number((t.match(/(\d{1,2})\s*%?/)||[])[1]||10),req={requested:n,priority:/urgente/.test(t)?"Urgente":"Operativa",duration:"single_operation"};s.powerRequest={...req,state:"PENDIENTE"};tev("ACTION",{actionId:"request_additional_power",contactId:cId||s.selectedContactId||null});tev("POWER_REQUEST",{requested:n,priority:req.priority,duration:req.duration});const ans=makePowerResponse(s,req);Object.assign(s.powerRequest,ans);log("POWER +"+n+"% → OPS · "+ans.state+" +"+ans.granted+"%");tev("POWER_RESPONSE",{...ans});repaint();return {ok:true,text:"Operaciones responde "+ans.state+", +"+ans.granted+"%."}}
  if(/\b(compensa|compensar)\b/.test(t)&&/interferencia/.test(t)){const kind=/manual/.test(t)?"manual":"automatic",r=applyInterference(s,kind);log("INTERFERENCE");tev("INTERFERENCE_ACTION",{action:kind});repaint();return {ok:true,text:r.message+"."}}
  if(/\b(diagnostico|diagnóstico|autotest|auto test)\b/.test(raw.toLowerCase())){const r=runDiagnostic(s,"all");log("DIAGNOSTIC "+r.id+" · "+r.status);tev("DIAGNOSTIC_RUN",{scope:"all",reportId:r.id,status:r.status});repaint();return {ok:true,text:"Diagnóstico "+r.status+". Incidencias: "+r.issues.length+"."}}
  if(/\b(actualiza|actualizar)\b/.test(t)&&/\bposicion|posición\b/.test(raw.toLowerCase())){if(!cId)return need();const r=updateTracking(s,cId,"position");if(!r.ok)return {ok:false,text:r.reason};log("TRACK UPDATE "+cId);tev("TRACK_OPERATION",{contactId:cId,operation:"position"});repaint();return {ok:true,text:r.value+"."}}
  if(/\btrayectoria|predice|predecir\b/.test(t)){if(!cId)return need();const r=updateTracking(s,cId,"trajectory",{horizon:/30/.test(t)?"30 min":/15/.test(t)?"15 min":"5 min"});if(r.ok)tev("TRACK_OPERATION",{contactId:cId,operation:"trajectory"});return r.ok?{ok:true,text:r.value+"."}:{ok:false,text:r.reason}}
  if(/\b(recupera|recuperar|readquiere|readquirir)\b/.test(t)){if(!cId)return need();const r=updateTracking(s,cId,"reacquire");if(!r.ok)return {ok:false,text:r.reason};lastContact=cId;log("REACQUIRE "+cId);tev("REACQUIRE",{contactId:cId});repaint();return {ok:true,text:r.value+"."}}
  if(/\b(compara|comparar)\b/.test(t)&&/lectur|resultado/.test(t)){if(s.results.length<2)return {ok:false,text:"Se necesitan al menos dos resultados."};const r=compareReadings(s,s.results[0].id,s.results[1].id);if(!r.ok)return {ok:false,text:r.reason};log("COMPARE");tev("RESULT_COMPARE",{a:s.results[0].id,b:s.results[1].id});repaint();return {ok:true,text:r.comparison.summary+"."}}
  if(/\b(guarda|guardar)\b/.test(t)&&/lectur|resultado/.test(t)){if(!s.results.length)return {ok:false,text:"No hay resultados que guardar."};const r=saveReading(s,s.results[0].id,"Guardado por computadora");if(!r.ok)return {ok:false,text:r.reason};log("SAVE "+r.saved.savedId);tev("RESULT_SAVE",{resultId:s.results[0].id,savedId:r.saved.savedId});repaint();return {ok:true,text:"Resultado guardado como "+r.saved.savedId+"."}}
  if(/\b(contactos seguidos|capacidad de seguimiento|capacidad tracking)\b/.test(t)){tev("NAV_PRIMARY",{primaryId:"tracking"});tev("NAV_SECONDARY",{primaryId:"tracking",secondaryId:"tracked_contacts"});log("CONTACTOS SEGUIDOS · COMPUTER");return {ok:true,text:"Capacidad de seguimiento "+trackingUsed(s)+"/"+s.tracking.capacity+"."}}
  if(/\b(firma subespacial|lectura subespacial)\b/.test(t)){if(!cId)return need();lastContact=cId;s.selectedContactId=cId;tev("READOUT_OPEN",{contactId:cId});tev("NAV_SECONDARY",{primaryId:"sensor_readout",secondaryId:"subspace_signature"});log("READOUT SUBSPACE "+cId);return {ok:true,text:"Lectura subespacial de "+cId+" abierta."}}
  if(/\b(enviar|envia|remite|transfiere)\b/.test(t)&&/\bmando\b/.test(t)){if(!cId)return need();transferData(s,"COMMAND",cId,{source:"computer_v02"});lastContact=cId;tev("HANDOFF",{target:"command",contactId:cId});log("TRANSFER "+cId+" → COMMAND");repaint();return {ok:true,text:"Datos de "+cId+" enviados a Mando."}}
  if(/\b(enviar|envia|remite|transfiere)\b/.test(t)&&/\btactica|táctica\b/.test(raw.toLowerCase())){if(!cId)return need();transferData(s,"TACTICAL",cId,{source:"computer_v02"});lastContact=cId;tev("HANDOFF",{target:"tactical",contactId:cId});log("TRANSFER "+cId+" → TACTICAL");repaint();return {ok:true,text:"Datos de "+cId+" enviados a Táctica."}}
  if(/\b(estado|informe)\b/.test(t))return {ok:true,text:"Sensores "+(effectivePenalty(s)>25?"degradados":"operativos")+". Potencia "+s.power+"%. Seguimiento "+trackingUsed(s)+"/"+s.tracking.capacity+"."};
  if(/\b(recomienda|recomendacion|recomendación|aconseja)\b/.test(raw.toLowerCase())){const c=cId?getContact(s,cId):selected();if(!c)return {ok:false,text:"Seleccione o indique un contacto."};return {ok:true,text:c.confidence<60?c.id+" tiene confianza baja. Recomiendo barrido focalizado o alta resolución.":!c.tracked?c.id+" no está en seguimiento. Recomiendo seguirlo si es operacionalmente relevante.":c.id+" tiene lectura estable; mantenga seguimiento o transfiera a Ciencia según misión."}}
  return {ok:false,text:"No he podido convertir esa frase en una operación segura. Reformule indicando acción, objetivo y prioridad."}
}
function need(){return {ok:false,text:"Necesito identificar el contacto. Indique un ID como C-43."}}
function setSelect(id,value){
  const el=$(id);if(!el)return false;
  el.value=value;
  el.dispatchEvent(new Event("change",{bubbles:true}));
  return true;
}
function setMulti(id,values){
  const el=$(id);if(!el)return;
  const set=new Set(values||[]);
  [...el.options].forEach(o=>o.selected=set.has(o.value));
  el.dispatchEvent(new Event("change",{bubbles:true}));
}
function awaitLatestResult(kind,previousId){
  const check=()=>{
    const r=sim()?.results?.[0];
    if(r&&r.id!==previousId&&(kind==="scan"?r.type==="scan":r.type==="search")){
      busy=false;log("COMPLETE "+r.id+" · "+r.summary);say("Operación "+r.id+" completada: "+r.summary,"ok");repaint();return;
    }
    setTimeout(check,180);
  };
  setTimeout(check,180);
}
function runScan(cfg){
  const b=bridge(),s=sim();if(!b||!s)return;
  const previous=s.results?.[0]?.id||null;
  if(cfg.contactId){s.selectedContactId=cfg.contactId;lastContact=cfg.contactId}
  b.navPrimary("scans");
  b.navSecondary(cfg.scanType);
  setSelect("#scan-mode",cfg.mode||"passive");
  if(cfg.targetValue)setSelect("#target-scope",cfg.targetValue);
  if(cfg.resolution)setSelect("#resolution",cfg.resolution);
  if(cfg.priority)setSelect("#priority",cfg.priority);
  if(cfg.duration)setSelect("#duration",cfg.duration);
  if(cfg.filters)setMulti("#filters",cfg.filters);
  busy=true;log("NATIVE SCAN "+cfg.scanType+" · "+cfg.targetLabel);
  b.doTask("execute_scan");
  renderAssistant();
  awaitLatestResult("scan",previous);
}
function runSearch(cfg){
  const b=bridge(),s=sim();if(!b||!s)return;
  const previous=s.results?.[0]?.id||null;
  b.navPrimary("search_localize");
  b.navSecondary(cfg.searchType);
  if(cfg.area)setSelect("#search-area",cfg.area);
  if(cfg.sensitivity)setSelect("#search-sensitivity",cfg.sensitivity);
  if(cfg.resolution)setSelect("#search-resolution",cfg.resolution);
  const criteria=$("#search-criteria");if(criteria&&cfg.criteria!=null){criteria.value=cfg.criteria;criteria.dispatchEvent(new Event("change",{bubbles:true}))}
  busy=true;log("NATIVE SEARCH "+cfg.searchType+" · "+cfg.area);
  b.doTask("start_search");
  renderAssistant();
  awaitLatestResult("search",previous);
}
function init(){const sel=$("#computer-select-v02"),run=$("#computer-run-v02"),input=$("#computer-command-v02"),toggle=$("#computer-toggle-v02");if(!sel||!run||!input)return;profile=sel.value||"picard";sel.onchange=()=>{profile=sel.value;log("PROFILE "+profile.toUpperCase());say("Perfil cambiado a "+comp().name+".","ok");renderAssistant()};run.onclick=()=>execute(input.value);input.onkeydown=e=>{if(e.key==="Enter")execute(input.value)};toggle.onclick=()=>{const p=$("#computer-assistant-v02");p.classList.toggle("collapsed");toggle.textContent=p.classList.contains("collapsed")?"Mostrar":"Ocultar"};$("#mode-select")?.addEventListener("change",renderAssistant);$("#teacher-order-ack")?.addEventListener("click",()=>setTimeout(renderAssistant,0));renderAssistant()}
if(window.SensorsConsoleV02?.shell?.sim)init();else window.addEventListener("sensors-ready-v02",init,{once:true});
