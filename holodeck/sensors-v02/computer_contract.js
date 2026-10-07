export const CONTRACT_VERSION="1.0";

export const ACTION_TYPES=new Set([
  "scan","search","track_start","track_stop","track_priority","track_signature",
  "track_update","readout","transfer","power_request","interference","diagnostic",
  "calibrate","select_array","engineering_request","mark","save_result",
  "compare_results","load_profile","apply_config","watch","status"
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
    scan:{scanType:"short_range|long_range|focused",contactId:"string|null",target:"sector_041|local|system|...",mode:"passive|active",resolution:"general|standard|high",priority:"none|subspace|warp|em|gravimetric|thermal|biological|transponder",duration:"quick|standard|extended",filters:"string[]"},
    search:{searchType:"starship|shuttle|warp_signature|subspace_emission|signal_transponder|lifeform|energy_source|custom_signature",area:"sector_041|local|system|wide",sensitivity:"low|standard|high|maximum",resolution:"general|standard|high",criteria:"string"},
    track_start:{contactId:"string",priority:"normal|priority"},
    track_stop:{contactId:"string"},
    track_priority:{contactId:"string",priority:"normal|priority"},
    track_signature:{contactId:"string",signature:"warp|subspace|em|thermal|transponder"},
    track_update:{contactId:"string",operation:"position|course|velocity|trajectory|reacquire",horizon:"5 min|15 min|30 min|null"},
    readout:{contactId:"string",readout:"signal_strength|signature_type|band_frequency|energy_signature|subspace_signature|approx_mass|approx_dimensions|vector_velocity|detectable_lifeforms|known_pattern_match"},
    transfer:{contactId:"string",target:"science|tactical|command"},
    power_request:{requested:"number",priority:"Operativa|Urgente",reason:"string"},
    interference:{operation:"automatic|manual|band|extend|recover|restore",band:"string|null",contactId:"string|null"},
    diagnostic:{scope:"all|PRIMARY|AUX"},
    calibrate:{arrayId:"PRIMARY|AUX"},
    select_array:{arrayId:"PRIMARY|AUX"},
    engineering_request:{component:"PRIMARY|AUX",reason:"string"},
    mark:{contactId:"string",marked:"boolean"},
    save_result:{resultId:"string|null"},
    compare_results:{a:"string|null",b:"string|null"},
    load_profile:{profileId:"standard|long_range|search_rescue|low_noise"},
    apply_config:{setting:"string",value:"unknown"},
    watch:{contactId:"string",condition:"course_change|confidence_below|contact_lost",threshold:"number|null"},
    status:{scope:"sensors|tracking|contact|ship",contactId:"string|null"}
  }
};

export const INTERPRETER_INSTRUCTIONS=`
Eres la capa de interpretación de la Computadora de a bordo.
NO ejecutas acciones ni inventas resultados. Solo conviertes lenguaje humano en un contrato JSON.
Debes tolerar faltas de ortografía, frases coloquiales y referencias contextuales cuando el perfil de computadora lo permita.
Usa únicamente los tipos de acción definidos por CONTRACT_SPEC.
Si falta una decisión que no puede inferirse con seguridad, devuelve needsClarification=true y una única clarificationQuestion concreta.
No decidas por el oficial qué contacto abandonar, qué objetivo atacar, qué riesgo aceptar ni qué recurso sacrificar.
La salida debe ser JSON válido, sin markdown ni texto adicional.
`;

const REQUIRED={
  scan:["scanType"],search:["searchType"],track_start:["contactId"],track_stop:["contactId"],
  track_priority:["contactId","priority"],track_signature:["contactId","signature"],
  track_update:["contactId","operation"],readout:["contactId","readout"],transfer:["contactId","target"],
  power_request:["requested"],interference:["operation"],diagnostic:["scope"],calibrate:["arrayId"],
  select_array:["arrayId"],engineering_request:["component"],mark:["contactId","marked"],
  load_profile:["profileId"],apply_config:["setting"],watch:["contactId","condition"],status:["scope"]
};

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
  });
  return {ok:errors.length===0,errors,plan:{version:CONTRACT_VERSION,intentSummary:String(plan.intentSummary||""),needsClarification:false,clarificationQuestion:null,actions}};
}

export function planPreview(plan){
  if(plan?.needsClarification)return [{label:"Aclaración",value:plan.clarificationQuestion||"—"}];
  return (plan?.actions||[]).map((a,i)=>({label:"Paso "+(i+1),value:a.type+" · "+Object.entries(a).filter(([k])=>k!=="type").map(([k,v])=>k+"="+(Array.isArray(v)?v.join(","):v)).join(" · ")}));
}
