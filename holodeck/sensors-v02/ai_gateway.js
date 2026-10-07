import {CONTRACT_VERSION,CONTRACT_SPEC,INTERPRETER_INSTRUCTIONS,COMPUTER_PROFILES} from "./computer_contract.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9%\-\s]/g," ").replace(/\s+/g," ").trim();
const has=(t,...words)=>words.some(w=>t.includes(norm(w)));
const contactFrom=raw=>(String(raw||"").toUpperCase().match(/\bC-?\d+\b/)||[])[0]?.replace(/^C(\d)/,"C-$1")||null;
const sectorFrom=t=>{const m=t.match(/sector\s*(\d{1,3})/);return m?"sector_"+m[1].padStart(3,"0"):null};
const numFrom=t=>{const m=t.match(/(\d{1,3})\s*%?/);return m?Number(m[1]):null};

function selectedContact(context,profile){
  return profile.inferSelectedContact?context?.selection?.contactId||null:null;
}
function currentSector(context,profile){
  return profile.inferCurrentSector?"sector_"+String(context?.sensors?.sector||"041").padStart(3,"0"):null;
}
function splitCommands(raw){
  return String(raw||"").split(/\s*(?:;|\by luego\b|\by despues\b|\bdespues\b|\by después\b|\bdespués\b)\s*/i).map(x=>x.trim()).filter(Boolean);
}
function clarify(question,summary="Necesito una aclaración"){
  return {version:CONTRACT_VERSION,intentSummary:summary,needsClarification:true,clarificationQuestion:question,actions:[]};
}
function actionPlan(summary,actions){
  return {version:CONTRACT_VERSION,intentSummary:summary,needsClarification:false,clarificationQuestion:null,actions};
}

function parseOne(raw,context,profile){
  const t=norm(raw),explicit=contactFrom(raw),cid=explicit||selectedContact(context,profile);
  const sector=sectorFrom(t)||currentSector(context,profile);

  if(has(t,"estado","informe","situacion","situación")){
    if(has(t,"seguimiento","tracking"))return {type:"status",scope:"tracking",contactId:cid};
    if(cid)return {type:"status",scope:"contact",contactId:cid};
    return {type:"status",scope:"sensors",contactId:null};
  }

  if(has(t,"deja de seguir","finaliza seguimiento","deten seguimiento","libera seguimiento","quita seguimiento")){
    if(!cid)return {clarify:"¿Qué contacto debo dejar de seguir?"};
    return {type:"track_stop",contactId:cid};
  }

  if(has(t,"sigue","seguir","seguimiento","manten","mantén")){
    if(!cid)return {clarify:"¿Qué contacto desea mantener en seguimiento?"};
    if(has(t,"firma warp","warp"))return {type:"track_signature",contactId:cid,signature:"warp",priority:has(t,"prioridad","prioritario","alta")?"priority":"normal"};
    return {type:"track_start",contactId:cid,priority:has(t,"prioridad","prioritario","alta")?"priority":"normal"};
  }

  if(has(t,"actualiza posicion","actualizar posicion","actualiza posición","actualizar posición")){
    if(!cid)return {clarify:"¿De qué contacto desea actualizar la posición?"};
    return {type:"track_update",contactId:cid,operation:"position",horizon:null};
  }
  if(has(t,"trayectoria","predice","predecir")){
    if(!cid)return {clarify:"¿De qué contacto desea predecir la trayectoria?"};
    return {type:"track_update",contactId:cid,operation:"trajectory",horizon:has(t,"30")?"30 min":has(t,"15")?"15 min":"5 min"};
  }
  if(has(t,"recupera","recuperar","readquiere","readquirir")){
    if(!cid)return {clarify:"¿Qué contacto perdido desea recuperar?"};
    return {type:"track_update",contactId:cid,operation:"reacquire",horizon:null};
  }

  if(has(t,"barrido","escaneo","escanea")){
    if(has(t,"focal","focalizado")||cid){
      if(!cid)return {clarify:"¿Sobre qué contacto desea realizar el barrido focalizado?"};
      return {type:"scan",scanType:"focused",contactId:cid,target:cid,mode:has(t,"activo")?"active":"passive",resolution:has(t,"alta resolucion","alta resolución")?"high":"standard",priority:"none",duration:has(t,"extendido","prolongado")?"extended":"standard",filters:["all"]};
    }
    if(has(t,"largo alcance")){
      if(!sector)return {clarify:"¿Sobre qué sector o área desea realizar el barrido de largo alcance?"};
      return {type:"scan",scanType:"long_range",contactId:null,target:sector,mode:has(t,"activo")?"active":"passive",resolution:has(t,"alta resolucion","alta resolución")?"high":"standard",priority:has(t,"subespacio","subespacial")?"subspace":has(t,"warp")?"warp":"none",duration:has(t,"extendido","prolongado")?"extended":"standard",filters:has(t,"subespacio","subespacial")?["subspace","warp"]:["all"]};
    }
    if(has(t,"corto alcance"))return {type:"scan",scanType:"short_range",contactId:null,target:sector||"local",mode:has(t,"activo")?"active":"passive",resolution:"standard",priority:"none",duration:"standard",filters:["all"]};
  }

  if(has(t,"busca","buscar","localiza","localizar","rastrea")){
    if(!sector)return {clarify:"¿En qué sector o área desea realizar la búsqueda?"};
    const type=has(t,"lanzadera")?"shuttle":has(t,"firma warp","warp")?"warp_signature":has(t,"transpondedor","baliza","senal","señal")?"signal_transponder":has(t,"vida","forma de vida")?"lifeform":has(t,"subespacio","subespacial")?"subspace_emission":has(t,"energia","energía")?"energy_source":has(t,"nave")?"starship":null;
    if(!type)return {clarify:"¿Qué clase de firma u objetivo desea localizar?"};
    return {type:"search",searchType:type,area:sector,sensitivity:has(t,"maxima","máxima")?"maximum":has(t,"alta")?"high":"standard",resolution:has(t,"alta resolucion","alta resolución")?"high":"standard",criteria:""};
  }

  if(has(t,"envia","envía","enviar","transfiere","transferir","remite")){
    if(!cid)return {clarify:"¿Qué contacto desea transferir?"};
    const target=has(t,"ciencia")?"science":has(t,"tactica","táctica")?"tactical":has(t,"mando","puente","capitan","capitán")?"command":null;
    if(!target)return {clarify:"¿A qué departamento debo enviar los datos?"};
    return {type:"transfer",contactId:cid,target};
  }

  if(has(t,"potencia")&&has(t,"solicita","solicitar","pide","pedir")){
    return {type:"power_request",requested:numFrom(t)||10,priority:has(t,"urgente")?"Urgente":"Operativa",reason:"Solicitud del oficial"};
  }

  if(has(t,"interferencia","interferencias")){
    if(has(t,"restaura","restaurar"))return {type:"interference",operation:"restore",band:null,contactId:cid};
    if(has(t,"manual"))return {type:"interference",operation:"manual",band:null,contactId:cid};
    if(has(t,"banda"))return {type:"interference",operation:"band",band:"em",contactId:cid};
    if(has(t,"prolonga","integracion","integración"))return {type:"interference",operation:"extend",band:null,contactId:cid};
    return {type:"interference",operation:"automatic",band:null,contactId:cid};
  }

  if(has(t,"diagnostico","diagnóstico","autotest","auto test"))return {type:"diagnostic",scope:has(t,"aux")?"AUX":has(t,"primary","primaria")?"PRIMARY":"all"};
  if(has(t,"calibra","calibrar"))return {type:"calibrate",arrayId:has(t,"aux")?"AUX":"PRIMARY"};
  if(has(t,"selecciona matriz","cambia a matriz","usa matriz"))return {type:"select_array",arrayId:has(t,"aux")?"AUX":"PRIMARY"};
  if(has(t,"ingenieria","ingeniería")&&has(t,"solicita","solicitar","avisa","avisar"))return {type:"engineering_request",component:has(t,"aux")?"AUX":"PRIMARY",reason:"Solicitud del oficial"};

  if(has(t,"marca","marcar")&&!has(t,"desmarca","quita marca")){
    if(!cid)return {clarify:"¿Qué contacto desea marcar?"};
    return {type:"mark",contactId:cid,marked:true};
  }
  if(has(t,"desmarca","quita marca")){
    if(!cid)return {clarify:"¿Qué contacto desea desmarcar?"};
    return {type:"mark",contactId:cid,marked:false};
  }

  if(has(t,"firma subespacial","lectura subespacial")){
    if(!cid)return {clarify:"¿De qué contacto desea la firma subespacial?"};
    return {type:"readout",contactId:cid,readout:"subspace_signature"};
  }
  if(has(t,"lectura","analiza","analizar")){
    if(!cid)return {clarify:"¿Qué contacto desea analizar?"};
    return {type:"readout",contactId:cid,readout:"signature_type"};
  }

  if(has(t,"guarda","guardar")&&has(t,"resultado","lectura"))return {type:"save_result",resultId:null};
  if(has(t,"compara","comparar")&&has(t,"resultado","lecturas","lectura"))return {type:"compare_results",a:null,b:null};

  if(has(t,"perfil")&&has(t,"largo alcance"))return {type:"load_profile",profileId:"long_range"};
  if(has(t,"perfil")&&has(t,"rescate"))return {type:"load_profile",profileId:"search_rescue"};
  if(has(t,"perfil")&&has(t,"ruido"))return {type:"load_profile",profileId:"low_noise"};

  if(has(t,"avisa","avisame","avísame","notifica")&&cid){
    if(has(t,"rumbo","curso"))return {type:"watch",contactId:cid,condition:"course_change",threshold:5};
    if(has(t,"pierde","perdido"))return {type:"watch",contactId:cid,condition:"contact_lost",threshold:null};
  }

  return {clarify:"No he entendido con suficiente seguridad la intención. ¿Puede reformular la orden indicando acción y objetivo?"};
}

export function localInterpret(text,context,profileId="picard"){
  const profile=COMPUTER_PROFILES[profileId]||COMPUTER_PROFILES.picard;
  const parts=splitCommands(text);
  if(parts.length>profile.maxActions)return clarify(profile.name+" admite un máximo de "+profile.maxActions+" acciones por orden. Divida la instrucción.","Orden demasiado compleja para esta computadora");
  const actions=[];
  for(const p of parts){
    const r=parseOne(p,context,profile);
    if(r.clarify)return clarify(r.clarify);
    actions.push(r);
  }
  return actionPlan(String(text||"").trim(),actions);
}

export function aiEndpoint(){
  return window.SENSOR_AI_CONFIG?.endpoint||localStorage.getItem("sensorAI.endpoint")||"";
}

export async function interpretCommand({text,context,profileId="picard",inputMode="text"}){
  const endpoint=aiEndpoint();
  if(!endpoint)return {provider:"local",plan:localInterpret(text,context,profileId)};
  const model=window.SENSOR_AI_CONFIG?.model||localStorage.getItem("sensorAI.model")||"gemini";
  try{
    const res=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        task:"interpret_starship_command",
        model,profileId,inputMode,text,context,
        instructions:INTERPRETER_INSTRUCTIONS,
        contract:CONTRACT_SPEC
      })
    });
    if(!res.ok)throw new Error("HTTP "+res.status);
    const payload=await res.json();
    const plan=payload.plan||payload;
    return {provider:"gemini",plan};
  }catch(error){
    return {provider:"fallback",warning:"Gemini no disponible: "+error.message,plan:localInterpret(text,context,profileId)};
  }
}
