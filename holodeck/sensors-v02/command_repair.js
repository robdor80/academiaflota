import {COMPUTER_PROFILES,CONTRACT_VERSION,validateCommandPlan} from "./computer_contract.js";

const normalize=value=>String(value||"")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9%\-\s]/g," ")
  .replace(/\s+/g," ")
  .trim();

const contains=(text,...terms)=>terms.some(term=>text.includes(normalize(term)));

function sectorFrom(text){
  const match=text.match(/sector\s*(\d{1,3})/);
  return match?"sector_"+match[1].padStart(3,"0"):null;
}

function confidenceThreshold(raw){
  const match=String(raw||"").match(/(\d{1,3})\s*%/);
  return match?Number(match[1]):null;
}

export function repairConditionalScanMark(text,context,profileId="picard"){
  const profile=COMPUTER_PROFILES[profileId]||COMPUTER_PROFILES.picard;
  const normalized=normalize(text);

  if(profile.maxActions<2)return null;
  if(!contains(normalized,"barrido","escaneo","escanea"))return null;
  if(!contains(normalized,"marca","marcar"))return null;
  if(!contains(normalized,"contacto"))return null;

  const minConfidence=confidenceThreshold(text);
  if(minConfidence==null)return null;

  const target=sectorFrom(normalized) ||
    (profile.inferCurrentSector
      ?"sector_"+String(context?.sensors?.sector||"041").padStart(3,"0")
      :null);
  if(!target)return null;

  const isLongRange=contains(normalized,"largo alcance");
  const isShortRange=contains(normalized,"corto alcance");
  if(!isLongRange&&!isShortRange)return null;

  const hasSubspace=contains(normalized,"subespacio","subespacial");
  const hasWarp=contains(normalized,"warp");

  const scan={
    type:"scan",
    scanType:isLongRange?"long_range":"short_range",
    contactId:null,
    target,
    mode:contains(normalized,"activo")?"active":"passive",
    resolution:contains(normalized,"alta resolucion")?"high":"standard",
    priority:hasSubspace?"subspace":hasWarp?"warp":"none",
    duration:contains(normalized,"extendido","prolongado")?"extended":"standard",
    filters:hasSubspace&&hasWarp?["subspace","warp"]:hasSubspace?["subspace"]:hasWarp?["warp"]:["all"]
  };

  const plan={
    version:CONTRACT_VERSION,
    intentSummary:String(text||"").trim(),
    needsClarification:false,
    clarificationQuestion:null,
    actions:[
      scan,
      {
        type:"mark_matches",
        source:"last_scan",
        newOnly:contains(normalized,"nuevo","nuevos","nueva","nuevas"),
        minConfidence,
        marked:true
      }
    ]
  };

  const validation=validateCommandPlan(plan,profileId);
  return validation.ok?validation.plan:null;
}
