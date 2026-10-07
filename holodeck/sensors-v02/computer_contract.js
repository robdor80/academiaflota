export const CONTRACT_VERSION="1.0";

export const ACTION_TYPES=new Set([
  "scan","search","track_start","track_stop","track_priority","track_signature",
  "track_update","readout","transfer","power_request","power_release","interference",
  "diagnostic","calibrate","select_array","engineering_request","mark","save_result",
  "compare_results","repeat_operation","cancel_operation","load_profile","save_profile",
  "delete_profile","restore_standard","apply_config","watch","status","query"
]);

export const COMPUTER_PROFILES={
  pike:{
    id:"pike",name:"Constitution 2259 · Pike",
    description:"Automatización limitada. Requiere objetivos explícitos y evita encadenar decisiones.",
    caps:["1 acción por orden","Objetivo explícito","Confirmación frecuente"],
    maxActions:1,inferSelectedContact:false,inferCurrentSector:false,allowWatch:false
  },
  kirk:{
    id:"kirk",name:"Constitution 2266 · Kirk",
    description:"Contexto básico. Puede reutilizar el contacto seleccionado y encadenar procedimientos cortos.",
    caps:["Hasta 3 acciones","Contexto básico","Macros operativas"],
    maxActions:3,inferSelectedContact:true,inferCurrentSector:false,allowWatch:true
  },
  picard:{
    id:"picard",name:"Galaxy 2364 · Picard",
    description:"Asistencia avanzada. Comprende contexto operativo, secuencias y condiciones de vigilancia.",
    caps:["Hasta 8 acciones","Contexto operacional","Vigilancias","Sugerencias"],
    maxActions:8,inferSelectedContact:true,inferCurrentSector:true,allowWatch:true
  }
};

export const CONTRACT_SPEC={
  version:CONTRACT_VERSION,
  topLevel:{
    intentSummary:"string",
    needsClarification:"boolean",
    clarificationQuestion:"string|null",
    actions:"array"
  },
  actionTypes:{
    scan:{
      scanType:"short_range|long_range|focused",
      contactId:"string|null",target:"sector_041|local|system|coordinates|vector|defined_zone|...",
      mode:"passive|active",resolution:"general|standard|high",
      priority:"none|subspace|warp|em|gravimetric|thermal|ionizing_radiation|particle|biological|transponder",
      duration:"quick|standard|extended|custom",filters:"string[]"
    },
    search:{
      searchType:"starship|shuttle|probe_beacon|lifeform|artificial_object|energy_source|warp_signature|subspace_emission|signal_transponder|radiation_particle|custom_signature",
      area:"local|sector_041|sector_014|system|coordinates|wide",
      sensitivity:"low|standard|high|maximum",resolution:"general|standard|high",criteria:"string"
    },
    track_start:{contactId:"string",priority:"normal|priority"},
    track_stop:{contactId:"string"},
    track_priority:{contactId:"string",priority:"normal|priority"},
    track_signature:{contactId:"string",signature:"warp|subspace|em|thermal|transponder|energy|custom",priority:"normal|priority"},
    track_update:{contactId:"string",operation:"position|course|velocity|trajectory|reacquire",horizon:"5 min|15 min|30 min|null"},
    readout:{contactId:"string",readout:"signal_strength|signature_type|band_frequency|energy_signature|subspace_signature|approx_mass|approx_dimensions|vector_velocity|detectable_lifeforms|known_pattern_match"},
    transfer:{contactId:"string",target:"science|tactical|command"},
    power_request:{requested:"number",priority:"Operativa|Urgente",reason:"string"},
    power_release:{mode:"cancel_pending|release_granted"},
    interference:{
      operation:"automatic|manual|band|operation_power|reduce_resolution|extend_integration|recover_signal|restore",
      band:"string|null",contactId:"string|null",value:"number|null",resolution:"general|standard|high|null",
      sensitivity:"low|standard|high|maximum|null",integration:"standard|extended|null"
    },
    diagnostic:{scope:"all|PRIMARY|AUX"},
    calibrate:{arrayId:"PRIMARY|AUX"},
    select_array:{arrayId:"PRIMARY|AUX"},
    engineering_request:{component:"PRIMARY|AUX",diagnosticCode:"string|null",reason:"string",priority:"Baja|Normal|Alta|Urgente|null"},
    mark:{contactId:"string",marked:"boolean"},
    save_result:{resultId:"string|null"},
    compare_results:{a:"string|null",b:"string|null"},
    repeat_operation:{resultId:"string|null",overrides:"object|null"},
    cancel_operation:{operationId:"string|null"},
    load_profile:{profileId:"string"},
    save_profile:{profileId:"string",name:"string"},
    delete_profile:{profileId:"string"},
    restore_standard:{scope:"sensors"},
    apply_config:{
      setting:"sensitivity|default_resolution|sensor_power|sensor_array|band_frequency|update_rate|default_filters|default_priorities",
      value:"string|number|string[]"
    },
    watch:{contactId:"string",condition:"course_change|confidence_below|contact_lost",threshold:"number|null"},
    status:{scope:"sensors|tracking|contact|ship",contactId:"string|null"},
    query:{
      domain:"status|arrays|effective_range|resolution|power|integrity|interference|active_operations|contacts|tracking|results|diagnostics|profiles",
      filter:"string|null",contactId:"string|null",resultId:"string|null"
    }
  }
};

export const INTERPRETER_INSTRUCTIONS=`
Eres la capa de interpretación de la Computadora de a bordo.
NO ejecutas acciones ni inventas resultados. Solo conviertes lenguaje humano en un contrato JSON.
Debes tolerar faltas de ortografía, frases coloquiales, dictado imperfecto y referencias contextuales cuando el perfil de computadora lo permita.
Usa únicamente los tipos de acción y campos definidos por CONTRACT_SPEC.
Las acciones de navegación de interfaz no forman parte del contrato: traduce la intención a capacidad operativa o consulta.
Si el usuario pide "ver", "mostrar", "consultar", "qué hay", "cuánto queda" o equivalente, usa query/status/readout; no simules una acción física.
Si falta una decisión que no puede inferirse con seguridad, devuelve needsClarification=true y una única clarificationQuestion concreta.
No decidas por el oficial qué contacto abandonar, qué objetivo atacar, qué riesgo aceptar, qué recurso sacrificar ni qué orden de mando contradecir.
Nunca inventes un resultado de sensores, daño, permiso, potencia, contacto, diagnóstico o respuesta de otro departamento.
La salida debe ser JSON válido, sin markdown ni texto adicional.
`;

const REQUIRED={
  scan:["scanType"],search:["searchType"],track_start:["contactId"],track_stop:["contactId"],
  track_priority:["contactId","priority"],track_signature:["contactId","signature"],
  track_update:["contactId","operation"],readout:["contactId","readout"],transfer:["contactId","target"],
  power_request:["requested"],power_release:["mode"],interference:["operation"],diagnostic:["scope"],
  calibrate:["arrayId"],select_array:["arrayId"],engineering_request:["component"],
  mark:["contactId","marked"],repeat_operation:[],cancel_operation:[],load_profile:["profileId"],
  save_profile:["profileId","name"],delete_profile:["profileId"],restore_standard:["scope"],
  apply_config:["setting"],watch:["contactId","condition"],status:["scope"],query:["domain"]
};

const CONFIG_SETTINGS=new Set(["sensitivity","default_resolution","sensor_power","sensor_array","band_frequency","update_rate","default_filters","default_priorities"]);
const SEARCH_TYPES=new Set(["starship","shuttle","probe_beacon","lifeform","artificial_object","energy_source","warp_signature","subspace_emission","signal_transponder","radiation_particle","custom_signature"]);
const INTERFERENCE_OPS=new Set(["automatic","manual","band","operation_power","reduce_resolution","extend_integration","recover_signal","restore"]);

export function validateCommandPlan(plan,profileId="picard"){
  const errors=[];
  const profile=COMPUTER_PROFILES[profileId]||COMPUTER_PROFILES.picard;
  if(!plan||typeof plan!=="object")return {ok:false,errors:["El intérprete no devolvió un objeto."]};
  if(plan.version&&plan.version!==CONTRACT_VERSION)errors.push("Versión de contrato no soportada: "+plan.version);
  if(plan.needsClarification){
    if(!String(plan.clarificationQuestion||"").trim())errors.push("Falta clarificationQuestion.");
    return {ok:errors.length===0,errors,plan:{...plan,actions:[]}};
  }
  if(!Array.isArray(plan.actions))errors.push("actions debe ser un array.");
  const actions=Array.isArray(plan.actions)?plan.actions:[];
  if(actions.length>profile.maxActions)errors.push(profile.name+" admite como máximo "+profile.maxActions+" acciones por orden.");
  actions.forEach((a,i)=>{
    if(!a||typeof a!=="object"){errors.push("Acción "+(i+1)+" inválida.");return}
    if(!ACTION_TYPES.has(a.type)){errors.push("Tipo de acción no permitido: "+a.type);return}
    for(const key of REQUIRED[a.type]||[])if(a[key]===undefined||a[key]===null||a[key]==="")errors.push("Acción "+(i+1)+" ("+a.type+"): falta "+key+".");
    if(a.type==="watch"&&!profile.allowWatch)errors.push(profile.name+" no admite vigilancias automáticas.");
    if(a.type==="search"&&!SEARCH_TYPES.has(a.searchType))errors.push("Tipo de búsqueda no permitido: "+a.searchType);
    if(a.type==="apply_config"&&!CONFIG_SETTINGS.has(a.setting))errors.push("Ajuste no permitido: "+a.setting);
    if(a.type==="interference"&&!INTERFERENCE_OPS.has(a.operation))errors.push("Operación de interferencia no permitida: "+a.operation);
    if(a.type==="power_request"&&(Number(a.requested)<=0||Number(a.requested)>100))errors.push("La potencia solicitada debe estar entre 1 y 100.");
  });
  return {ok:errors.length===0,errors,plan:{version:CONTRACT_VERSION,intentSummary:String(plan.intentSummary||""),needsClarification:false,clarificationQuestion:null,actions}};
}

export function planPreview(plan){
  if(plan?.needsClarification)return [{label:"Aclaración",value:plan.clarificationQuestion||"—"}];
  return (plan?.actions||[]).map((a,i)=>({label:"Paso "+(i+1),value:a.type+" · "+Object.entries(a).filter(([k])=>k!=="type").map(([k,v])=>k+"="+(Array.isArray(v)?v.join(","):typeof v==="object"&&v!==null?JSON.stringify(v):v)).join(" · ")}));
}
