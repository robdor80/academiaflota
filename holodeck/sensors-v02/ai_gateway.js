import {CONTRACT_VERSION,CONTRACT_SPEC,GEMINI_RESPONSE_SCHEMA,INTERPRETER_INSTRUCTIONS,COMPUTER_PROFILES,validateCommandPlan} from "./computer_contract.js";
import {getComputerConfig} from "./computer_cloud.js";
import {repairConditionalScanMark} from "./command_repair.js";

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

  // Consultas equivalentes a las vistas manuales de v0.1.
  if(has(t,"matrices disponibles","que matrices","qué matrices"))return {type:"query",domain:"arrays",filter:null,contactId:cid,resultId:null};
  if(has(t,"alcance efectivo","que alcance","qué alcance"))return {type:"query",domain:"effective_range",filter:null,contactId:cid,resultId:null};
  if(has(t,"resolucion disponible","resolución disponible","que resolucion","qué resolución"))return {type:"query",domain:"resolution",filter:null,contactId:cid,resultId:null};
  if(has(t,"potencia asignada","cuanta potencia","cuánta potencia")&&!has(t,"solicita","solicitar","pide","pedir","aumenta","sube"))return {type:"query",domain:"power",filter:null,contactId:cid,resultId:null};
  if(has(t,"integridad","danos","daños"))return {type:"query",domain:"integrity",filter:null,contactId:cid,resultId:null};
  if(has(t,"operaciones activas","que operaciones","qué operaciones"))return {type:"query",domain:"active_operations",filter:null,contactId:cid,resultId:null};
  if(has(t,"contactos marcados"))return {type:"query",domain:"contacts",filter:"marked",contactId:null,resultId:null};
  if(has(t,"contactos no identificados","no identificados"))return {type:"query",domain:"contacts",filter:"unidentified",contactId:null,resultId:null};
  if(has(t,"contactos identificados","identificados"))return {type:"query",domain:"contacts",filter:"identified",contactId:null,resultId:null};
  if(has(t,"contactos perdidos","perdidos recientemente"))return {type:"query",domain:"contacts",filter:"lost",contactId:null,resultId:null};
  if(has(t,"todos los contactos","lista de contactos","muestra los contactos"))return {type:"query",domain:"contacts",filter:"all",contactId:null,resultId:null};
  if(has(t,"resultados recientes","ultimos resultados","últimos resultados"))return {type:"query",domain:"results",filter:"recent",contactId:null,resultId:null};
  if(has(t,"lecturas guardadas","resultados guardados"))return {type:"query",domain:"results",filter:"saved",contactId:null,resultId:null};
  if(has(t,"perfiles disponibles","lista de perfiles","que perfiles","qué perfiles"))return {type:"query",domain:"profiles",filter:null,contactId:null,resultId:null};
  if(has(t,"diagnosticos","diagnósticos","errores de sensores","degradacion","degradación")&&!has(t,"ejecuta","haz","realiza","diagnostico de","diagnóstico de"))return {type:"query",domain:"diagnostics",filter:null,contactId:null,resultId:null};

  if(has(t,"estado","informe","situacion","situación")){
    if(has(t,"seguimiento","tracking"))return {type:"status",scope:"tracking",contactId:cid};
    if(has(t,"sensor","sensores"))return {type:"status",scope:"sensors",contactId:null};
    if(explicit)return {type:"status",scope:"contact",contactId:explicit};
    if(cid&&has(t,"contacto","objetivo"))return {type:"status",scope:"contact",contactId:cid};
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
    const type=has(t,"lanzadera")?"shuttle":has(t,"sonda","probe")?"probe_beacon":has(t,"objeto artificial")?"artificial_object":has(t,"radiacion","radiación","particulas","partículas")?"radiation_particle":has(t,"firma warp","warp")?"warp_signature":has(t,"transpondedor","baliza","senal","señal")?"signal_transponder":has(t,"vida","forma de vida")?"lifeform":has(t,"subespacio","subespacial")?"subspace_emission":has(t,"energia","energía")?"energy_source":has(t,"nave")?"starship":null;
    if(!type)return {clarify:"¿Qué clase de firma u objetivo desea localizar?"};
    return {type:"search",searchType:type,area:sector,sensitivity:has(t,"maxima","máxima")?"maximum":has(t,"alta")?"high":"standard",resolution:has(t,"alta resolucion","alta resolución")?"high":"standard",criteria:""};
  }

  if(has(t,"envia","envía","enviar","transfiere","transferir","remite")){
    if(!cid)return {clarify:"¿Qué contacto desea transferir?"};
    const target=has(t,"ciencia")?"science":has(t,"tactica","táctica")?"tactical":has(t,"mando","puente","capitan","capitán")?"command":null;
    if(!target)return {clarify:"¿A qué departamento debo enviar los datos?"};
    return {type:"transfer",contactId:cid,target};
  }

  if(has(t,"potencia")&&has(t,"libera","liberar","devuelve","devolver"))return {type:"power_release",mode:"release_granted"};
  if(has(t,"solicitud de potencia","peticion de potencia","petición de potencia")&&has(t,"cancela","cancelar"))return {type:"power_release",mode:"cancel_pending"};

  if(has(t,"potencia")&&has(t,"solicita","solicitar","pide","pedir")){
    return {type:"power_request",requested:numFrom(t)||10,priority:has(t,"urgente")?"Urgente":"Operativa",reason:"Solicitud del oficial"};
  }

  if(has(t,"interferencia","interferencias")){
    if(has(t,"restaura","restaurar"))return {type:"interference",operation:"restore",band:null,contactId:cid};
    if(has(t,"aumenta potencia","sube potencia","potencia de operacion","potencia de operación"))return {type:"interference",operation:"operation_power",value:numFrom(t)||80,contactId:cid};
    if(has(t,"reduce resolucion","reduce resolución","baja resolucion","baja resolución"))return {type:"interference",operation:"reduce_resolution",resolution:"general",contactId:cid};
    if(has(t,"prolonga","integracion","integración"))return {type:"interference",operation:"extend_integration",band:null,contactId:cid};
    if(has(t,"recupera senal","recupera señal","recuperar senal","recuperar señal"))return {type:"interference",operation:"recover_signal",band:null,contactId:cid};
    if(has(t,"manual"))return {type:"interference",operation:"manual",band:null,contactId:cid};
    if(has(t,"banda"))return {type:"interference",operation:"band",band:has(t,"subespacio")?"subspace":has(t,"termica","térmica")?"thermal":"em",contactId:cid};
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

  if(has(t,"cancela","cancelar")&&has(t,"operacion","operación","barrido","busqueda","búsqueda"))return {type:"cancel_operation",operationId:null};
  if(has(t,"repite","repetir","hazlo otra vez","otra vez")&&has(t,"operacion","operación","barrido","busqueda","búsqueda","ultimo","último"))return {type:"repeat_operation",resultId:null,overrides:has(t,"alta resolucion","alta resolución")?{resolution:"high"}:null};

  if(has(t,"guarda","guardar")&&has(t,"resultado","lectura"))return {type:"save_result",resultId:null};
  if(has(t,"compara","comparar")&&has(t,"resultado","lecturas","lectura"))return {type:"compare_results",a:null,b:null};

  if(has(t,"restaura","restaurar")&&has(t,"configuracion estandar","configuración estándar","estandar de la nave","estándar de la nave"))return {type:"restore_standard",scope:"sensors"};
  if(has(t,"sensibilidad")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"sensitivity",value:has(t,"maxima","máxima")?"maximum":has(t,"alta")?"high":has(t,"baja")?"low":"standard"};
  if(has(t,"resolucion predeterminada","resolución predeterminada")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"default_resolution",value:has(t,"alta")?"high":has(t,"general")?"general":"standard"};
  if(has(t,"potencia de sensores","potencia sensores")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"sensor_power",value:numFrom(t)||70};
  if(has(t,"matriz")&&has(t,"usa","selecciona","cambia","pon"))return {type:"select_array",arrayId:has(t,"aux")?"AUX":"PRIMARY"};
  if(has(t,"frecuencia de actualizacion","frecuencia de actualización")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"update_rate",value:has(t,"rapida","rápida")?"fast":has(t,"lenta")?"slow":"standard"};
  if(has(t,"prioridad predeterminada")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"default_priorities",value:has(t,"subespacio")?"subspace":has(t,"warp")?"warp":"none"};
  if(has(t,"banda predeterminada","frecuencia predeterminada")&&has(t,"pon","ajusta","cambia","establece"))return {type:"apply_config",setting:"band_frequency",value:has(t,"subespacio")?"subspace":has(t,"termica","térmica")?"thermal":"broad"};
  if(has(t,"borra perfil","elimina perfil")){
    const m=t.match(/(?:borra|elimina) perfil\s+([a-z0-9_\-]+)/);if(m)return {type:"delete_profile",profileId:m[1]};
    return {clarify:"¿Qué perfil desea eliminar?"};
  }

  if(has(t,"perfil")&&has(t,"largo alcance"))return {type:"load_profile",profileId:"long_range"};
  if(has(t,"perfil")&&has(t,"rescate"))return {type:"load_profile",profileId:"search_rescue"};
  if(has(t,"perfil")&&has(t,"ruido"))return {type:"load_profile",profileId:"low_noise"};
  if(has(t,"perfil")&&has(t,"estandar","estándar"))return {type:"load_profile",profileId:"standard"};

  if(has(t,"avisa","avisame","avísame","notifica")&&cid){
    if(has(t,"rumbo","curso"))return {type:"watch",contactId:cid,condition:"course_change",threshold:5};
    if(has(t,"pierde","perdido"))return {type:"watch",contactId:cid,condition:"contact_lost",threshold:null};
  }

  return {clarify:"No he entendido con suficiente seguridad la intención. ¿Puede reformular la orden indicando acción y objetivo?"};
}

export function localInterpret(text,context,profileId="picard"){
  const profile=COMPUTER_PROFILES[profileId]||COMPUTER_PROFILES.picard;
  const whole=norm(text);
  const repaired=repairConditionalScanMark(text,context,profileId);
  if(repaired)return repaired;
  const explicit=contactFrom(text),contextContact=explicit||selectedContact(context,profile);
  if(profile.allowWatch&&contextContact&&has(whole,"seguimiento","sigue","seguir","manten","mantén")&&has(whole,"avisa","avisame","avísame","notifica")&&has(whole,"rumbo","curso")){
    if(profile.maxActions<2)return clarify(profile.name+" necesita que divida la orden en dos instrucciones.","Orden compuesta no admitida");
    return actionPlan(String(text||"").trim(),[
      {type:"track_start",contactId:contextContact,priority:has(whole,"prioridad","prioritario","alta")?"priority":"normal"},
      {type:"watch",contactId:contextContact,condition:"course_change",threshold:5}
    ]);
  }
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

function configuredModels(){
  const cloud=getComputerConfig();
  const legacy=window.SENSOR_AI_CONFIG||{};
  return {
    cloud,
    defaultModel:cloud?.defaultModel||legacy.defaultModel||localStorage.getItem("sensorAI.defaultModel")||"gemini-3.5-flash-lite",
    escalationModel:cloud?.escalationModel||legacy.escalationModel||localStorage.getItem("sensorAI.escalationModel")||"gemini-3.8-flash"
  };
}

function responseText(payload){
  return (payload?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||"").join("").trim();
}

function cleanJsonText(raw){
  const t=String(raw||"").trim();
  if(!t.startsWith("```"))return t;
  return t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
}

async function callGeminiDirect({apiKey,model,text,context,profileId,inputMode,routingMode}){
  const endpoint="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent";
  const interpreterPayload={
    task:"interpret_starship_command",
    profileId,inputMode,text,context,
    routingMode,
    contract:CONTRACT_SPEC
  };
  const res=await fetch(endpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-goog-api-key":apiKey
    },
    body:JSON.stringify({
      systemInstruction:{
        parts:[{text:INTERPRETER_INSTRUCTIONS}]
      },
      contents:[{
        role:"user",
        parts:[{text:JSON.stringify(interpreterPayload)}]
      }],
      generationConfig:{
        responseMimeType:"application/json",
        temperature:0.1
      }
    })
  });

  if(!res.ok){
    let detail="";
    try{
      const err=await res.json();
      detail=err?.error?.message||"";
    }catch{}
    const e=new Error("Gemini "+res.status+(detail?": "+detail:""));
    e.kind="api_error";
    e.status=res.status;
    throw e;
  }

  const payload=await res.json();
  const raw=responseText(payload);
  if(!raw){
    const e=new Error("Gemini no devolvió contenido interpretable.");
    e.kind="invalid_json";
    throw e;
  }

  let plan;
  try{
    plan=JSON.parse(cleanJsonText(raw));
  }catch{
    const e=new Error("Gemini devolvió una respuesta que no es JSON válido.");
    e.kind="invalid_json";
    throw e;
  }

  return {
    plan,
    modelUsed:model,
    modelVersion:payload?.modelVersion||null,
    usageMetadata:payload?.usageMetadata||null
  };
}

const retryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function callGeminiWithRetry(args){
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const result=await callGeminiDirect(args);
      return {...result,retryCount:attempt-1};
    }catch(error){
      lastError=error;
      if(error?.status!==503||attempt===2)throw error;
      await retryDelay(900);
    }
  }
  throw lastError;
}

async function interpretDirectGemini({text,context,profileId,inputMode,routingMode,cloud,defaultModel,escalationModel}){
  const selectedModel=routingMode==="flash38"?escalationModel:defaultModel;
  let first;
  try{
    first=await callGeminiWithRetry({
      apiKey:cloud.geminiApiKey,
      model:selectedModel,
      text,context,profileId,inputMode,routingMode
    });
  }catch(error){
    const persistentAvailabilityFailure=
      selectedModel===defaultModel &&
      error?.status===503;

    if(routingMode==="auto"&&persistentAvailabilityFailure&&escalationModel!==defaultModel){
      const escalated=await callGeminiWithRetry({
        apiKey:cloud.geminiApiKey,
        model:escalationModel,
        text,context,profileId,inputMode,routingMode
      });
      return {
        provider:"gemini",
        ...escalated,
        escalated:true,
        escalationReason:"default_model_unavailable",
        routingMode
      };
    }
    throw error;
  }

  if(routingMode==="auto"&&selectedModel===defaultModel){
    const validation=validateCommandPlan(first.plan,profileId);
    const explicitUncertainty=first.plan?.interpreterUncertain===true;
    if(!validation.ok){
      const repaired=repairConditionalScanMark(text,context,profileId);
      if(repaired){
        return {
          provider:"gemini",
          plan:repaired,
          modelUsed:first.modelUsed||defaultModel,
          modelVersion:first.modelVersion||null,
          usageMetadata:first.usageMetadata||null,
          retryCount:first.retryCount||0,
          escalated:false,
          economyProtected:true,
          economyReason:"local_contract_repair",
          locallyRepaired:true,
          routingMode
        };
      }
    }
    if(!validation.ok||explicitUncertainty){
      return {
        provider:"gemini",
        plan:{
          version:CONTRACT_VERSION,
          intentSummary:String(first.plan?.intentSummary||text||""),
          needsClarification:true,
          clarificationQuestion:!validation.ok
            ?"La orden incluye una combinación que la Computadora todavía no puede representar con seguridad. Reformule indicando la acción principal y la condición que desea aplicar."
            :"Necesito una aclaración concreta para ejecutar la orden sin asumir decisiones del oficial.",
          actions:[]
        },
        modelUsed:first.modelUsed||defaultModel,
        modelVersion:first.modelVersion||null,
        usageMetadata:first.usageMetadata||null,
        retryCount:first.retryCount||0,
        escalated:false,
        economyProtected:true,
        economyReason:!validation.ok?"contract_validation":"interpreter_uncertainty",
        routingMode
      };
    }
  }

  return {provider:"gemini",...first,escalated:false,routingMode};
}

export function aiEndpoint(){
  if(getComputerConfig()?.geminiApiKey)return "gemini-direct";
  return window.SENSOR_AI_CONFIG?.endpoint||localStorage.getItem("sensorAI.endpoint")||"";
}

export async function interpretCommand({text,context,profileId="picard",inputMode="text",routingMode="auto"}){
  const {cloud,defaultModel,escalationModel}=configuredModels();

  if(cloud?.geminiApiKey){
    try{
      return await interpretDirectGemini({
        text,context,profileId,inputMode,routingMode,
        cloud,defaultModel,escalationModel
      });
    }catch(error){
      return {
        provider:"fallback",
        warning:"Gemini no disponible: "+(error.message||String(error)),
        plan:localInterpret(text,context,profileId)
      };
    }
  }

  const endpoint=window.SENSOR_AI_CONFIG?.endpoint||localStorage.getItem("sensorAI.endpoint")||"";
  if(!endpoint)return {provider:"local",plan:localInterpret(text,context,profileId)};

  const requestedModel=routingMode==="flash38"?escalationModel:defaultModel;
  try{
    const res=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        task:"interpret_starship_command",
        model:requestedModel,profileId,inputMode,text,context,
        routing:{
          mode:routingMode,
          defaultModel,
          escalationModel,
          autoPolicy:"conservative",
          escalateOn:["schema_failure","invalid_json","explicit_interpreter_uncertainty"],
          neverEscalateFor:["missing_human_decision","resource_conflict","authority_conflict"]
        },
        instructions:INTERPRETER_INSTRUCTIONS,
        contract:CONTRACT_SPEC
      })
    });
    if(!res.ok)throw new Error("HTTP "+res.status);
    const payload=await res.json();
    const plan=payload.plan||payload;
    return {provider:"gemini",plan,modelUsed:payload.modelUsed||requestedModel,escalated:!!payload.escalated,routingMode};
  }catch(error){
    return {provider:"fallback",warning:"Gemini no disponible: "+error.message,plan:localInterpret(text,context,profileId)};
  }
}
