function pct(v){
  const n=Number(v);
  return Number.isFinite(n)?Math.round(n)+"%":"—";
}

function listContacts(observations=[]){
  return observations.map(x=>x.id+" "+pct(x.confidence??x.match)).join(", ");
}

export function composeComputerResponse({plan,results}){
  if(!Array.isArray(results)||!results.length)return "";

  const actions=Array.isArray(plan?.actions)?plan.actions:[];
  const scanIndex=actions.findIndex(a=>a?.type==="scan");
  const searchIndex=actions.findIndex(a=>a?.type==="search");
  const markIndex=actions.findIndex(a=>a?.type==="mark_matches");

  if(markIndex>=0){
    const markAction=actions[markIndex];
    const markResult=results[markIndex]||{};
    const sourceIndex=markAction.source==="last_search"?searchIndex:scanIndex>=0?scanIndex:searchIndex;
    const sourceResult=sourceIndex>=0?results[sourceIndex]||{}:{};
    const changed=Array.isArray(markResult.changedIds)?markResult.changedIds:[];
    const min=Number(markAction.minConfidence)||0;

    if(changed.length){
      const verb=markAction.marked===false?"Desmarcados":"Marcados";
      return verb+" "+changed.join(", ")+" porque cumplen la condición solicitada"+
        (markAction.newOnly?" (contactos nuevos":" (confianza")+
        (markAction.newOnly?" y confianza ≥ "+min+"%).":" ≥ "+min+"%).");
    }

    if(markAction.newOnly){
      return "Operación completada. No se detectaron contactos nuevos con confianza igual o superior al "+min+"%, por lo que no se marcó ninguno.";
    }

    return "Operación completada. Ningún contacto del resultado alcanzó la confianza mínima del "+min+"%, por lo que no se marcó ninguno.";
  }

  if(actions.length===1){
    const r=results[0];
    return r?.text||"Operación completada.";
  }

  const meaningful=results.map(x=>x?.text).filter(Boolean);
  return meaningful.join(" ");
}

export function technicalSummaryFromResults(results=[]){
  return results
    .filter(Boolean)
    .map(r=>({
      kind:r.kind||"operation",
      text:r.text||"",
      observations:Array.isArray(r.observations)?r.observations:[],
      changedIds:Array.isArray(r.changedIds)?r.changedIds:[]
    }));
}
