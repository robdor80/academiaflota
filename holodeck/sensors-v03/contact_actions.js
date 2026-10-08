const text=value=>String(value??"").toLowerCase();

function isLost(contact){
  return contact?.status==="lost"||contact?.worldPresent===false||contact?.sensorVisible===false;
}

function isUnknown(contact){
  const label=text(contact?.classification);
  return contact?.status==="unidentified"||
    label==="no identificado"||
    label==="desconocido"||
    label==="unknown";
}

function isNatural(contact){
  const kind=text(contact?.kind);
  const label=text(contact?.classification);
  return ["asteroid","comet","planet","moon","natural_object","radiation_source"].includes(kind)||
    /asteroide|cometa|planeta|luna|meteor|objeto natural/.test(label);
}

function isVessel(contact){
  const kind=text(contact?.kind);
  return ["starship","shuttle"].includes(kind)||
    /nave|crucero|carguero|transporte|lanzadera|warbird|ave de guerra/.test(text(contact?.classification));
}

function isLifeform(contact){
  return text(contact?.kind)==="lifeform";
}

function trackingDescriptor(contact){
  if(!contact?.tracked){
    return {
      id:"track-start",
      kind:"tracking",
      state:"idle",
      label:"SEGUIR",
      tone:"primary",
      title:"Iniciar seguimiento estándar del contacto."
    };
  }

  const intensified=contact.trackingPriority==="priority";
  return {
    id:"tracking-split",
    kind:"tracking-split",
    state:intensified?"intensified":"standard",
    left:{
      id:intensified?"track-standard":"track-intensify",
      label:intensified?"ESTÁNDAR":"INTENSIFICAR",
      title:intensified
        ?"Reducir el seguimiento a prioridad estándar."
        :"Aumentar la prioridad y resolución del seguimiento."
    },
    right:{
      id:"track-stop",
      label:"DETENER",
      title:"Finalizar el seguimiento de este contacto."
    },
    tone:intensified?"priority":"primary"
  };
}

const action=(id,label,title,tone="normal",extra={})=>({id,label,title,tone,...extra});

export function resolveContactActions(contact,context={}){
  if(!contact)return {category:"none",label:"SIN CONTACTO",actions:[]};

  const lost=isLost(contact);
  const unknown=isUnknown(contact);
  const military=contact.military===true;
  const hostile=contact.hostile===true;
  const natural=isNatural(contact);
  const vessel=isVessel(contact);
  const lifeform=isLifeform(contact);
  const watched=!!context.watched;
  const compareAvailable=!!context.compareAvailable;

  if(lost){
    const actions=[];
    if(contact.tracked){
      actions.push(action("track-stop","DETENER SEGUIMIENTO","Libera los recursos de seguimiento que aún tenga asignados.","muted"));
    }
    actions.push(
      action("last-data","ÚLTIMOS DATOS","Consulta la última solución registrada antes de perder el contacto.","muted"),
      action(
        "reacquire",
        "READQUIRIR",
        contact.worldPresent===false||contact.sensorVisible===false
          ?"No existe una señal actual detectable; la readquisición quedará bloqueada hasta que vuelva a existir señal."
          :"Intentar recuperar la solución actual del contacto.",
        "primary",
        {
          disabled:contact.worldPresent===false||contact.sensorVisible===false,
          disabledReason:"Sin señal actual detectable"
        }
      ),
      action("transfer-bridge","ENVIAR A PUENTE","Envía al puente los últimos datos registrados.","bridge"),
      action("transfer-science","ENVIAR A CIENCIA","Envía a Ciencia los últimos datos registrados.","science")
    );
    return {category:"lost",label:"CONTACTO PERDIDO",actions:actions.slice(0,8)};
  }

  const actions=[];
  const canTrack=!natural||contact.relativeMotion!=="stationary";

  if(unknown&&military){
    actions.push(
      action("identify","IDENTIFICAR","Mejora la correlación de firma e intenta resolver la identidad.","primary"),
      ...(canTrack?[trackingDescriptor(contact)]:[]),
      action("tactical-scan","ESCANEO TÁCTICO","Resuelve todo lo disponible sobre energía, propulsión, escudos y armamento.","tactical"),
      action("analyze","ANALIZAR","Realiza un análisis focalizado de alta resolución.","analysis"),
      action("trajectory","TRAYECTORIA","Estima rumbo, velocidad, movimiento relativo y máxima aproximación.","navigation"),
      action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas sobre este contacto.":"Vigilar cambios de curso y pérdida de contacto.","watch"),
      action("transfer-tactical","ENVIAR A TÁCTICA","Transfiere la solución de sensores a Táctica.","tactical"),
      action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge")
    );
    return {category:"unknown-military",label:"MILITAR · IDENTIDAD INCOMPLETA",actions:actions.slice(0,8)};
  }

  if(unknown){
    actions.push(
      ...(canTrack?[trackingDescriptor(contact)]:[]),
      action("identify","IDENTIFICAR","Mejora la correlación de firma e intenta resolver la identidad.","primary"),
      action("analyze","ANALIZAR","Realiza un análisis focalizado de alta resolución.","analysis"),
      action("trajectory","TRAYECTORIA","Estima rumbo, velocidad, movimiento relativo y máxima aproximación.","navigation"),
      action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas sobre este contacto.":"Vigilar cambios de curso y pérdida de contacto.","watch"),
      action(contact.marked?"unmark":"mark",contact.marked?"DESMARCAR":"MARCAR",contact.marked?"Retira la marca operativa.":"Marca el contacto como relevante.","muted"),
      action("transfer-science","ENVIAR A CIENCIA","Transfiere las lecturas a Ciencia.","science"),
      action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge")
    );
    return {category:"unknown",label:"CONTACTO NO IDENTIFICADO",actions:actions.slice(0,8)};
  }

  if((military||hostile)&&vessel){
    actions.push(
      ...(canTrack?[trackingDescriptor(contact)]:[]),
      action("tactical-scan","ESCANEO TÁCTICO","Resuelve todo lo disponible sobre energía, propulsión, escudos y armamento.","tactical"),
      action("analyze","ANALIZAR","Realiza un análisis focalizado de alta resolución.","analysis"),
      action("trajectory","TRAYECTORIA","Estima rumbo, velocidad, movimiento relativo y máxima aproximación.","navigation"),
      action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas sobre este contacto.":"Vigilar cambios de curso y pérdida de contacto.","watch"),
      ...(compareAvailable?[action("compare","COMPARAR","Compara las dos lecturas focalizadas más recientes de este contacto.","analysis")]:[]),
      action("transfer-tactical","ENVIAR A TÁCTICA","Transfiere la solución de sensores a Táctica.","tactical"),
      action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge"),
      action(contact.marked?"unmark":"mark",contact.marked?"DESMARCAR":"MARCAR",contact.marked?"Retira la marca operativa.":"Marca el contacto como relevante.","muted")
    );
    return {category:hostile?"hostile-vessel":"military-vessel",label:hostile?"NAVE HOSTIL":"NAVE MILITAR",actions:actions.slice(0,8)};
  }

  if(natural){
    actions.push(
      ...(canTrack?[trackingDescriptor(contact)]:[]),
      action("analyze","ANALIZAR","Realiza un análisis focalizado del objeto.","analysis"),
      action("trajectory","TRAYECTORIA","Estima movimiento relativo y riesgo de aproximación.","navigation"),
      action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas.":"Vigilar cambios de trayectoria o pérdida de solución.","watch"),
      ...(compareAvailable?[action("compare","COMPARAR","Compara las dos lecturas más recientes.","analysis")]:[]),
      action("transfer-science","ENVIAR A CIENCIA","Transfiere las lecturas a Ciencia.","science"),
      action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge"),
      action(contact.marked?"unmark":"mark",contact.marked?"DESMARCAR":"MARCAR",contact.marked?"Retira la marca operativa.":"Marca el objeto como relevante.","muted")
    );
    return {category:"natural",label:"OBJETO NATURAL",actions:actions.slice(0,8)};
  }

  if(lifeform){
    actions.push(
      action("analyze","ANALIZAR","Realiza un análisis focalizado de alta resolución.","analysis"),
      action("lifeforms","LECTURA BIOLÓGICA","Consulta las formas de vida detectables.","science"),
      action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas.":"Vigilar cambios relevantes.","watch"),
      action("transfer-science","ENVIAR A CIENCIA","Transfiere las lecturas a Ciencia.","science"),
      action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge")
    );
    return {category:"lifeform",label:"FORMA DE VIDA",actions:actions.slice(0,8)};
  }

  actions.push(
    ...(canTrack?[trackingDescriptor(contact)]:[]),
    action("analyze","ANALIZAR","Realiza un análisis focalizado de alta resolución.","analysis"),
    action("trajectory","TRAYECTORIA","Estima rumbo, velocidad, movimiento relativo y máxima aproximación.","navigation"),
    action(watched?"watch-stop":"watch-start",watched?"VIGILANCIA ACTIVA":"VIGILAR",watched?"Detener las vigilancias automáticas sobre este contacto.":"Vigilar cambios de curso y pérdida de contacto.","watch"),
    ...(compareAvailable?[action("compare","COMPARAR","Compara las dos lecturas focalizadas más recientes de este contacto.","analysis")]:[]),
    action("transfer-science","ENVIAR A CIENCIA","Transfiere las lecturas a Ciencia.","science"),
    action("transfer-bridge","ENVIAR A PUENTE","Transfiere la solución al oficial al mando.","bridge"),
    action(contact.marked?"unmark":"mark",contact.marked?"DESMARCAR":"MARCAR",contact.marked?"Retira la marca operativa.":"Marca el contacto como relevante.","muted")
  );

  return {category:vessel?"civilian-vessel":"identified",label:vessel?"NAVE IDENTIFICADA":"CONTACTO IDENTIFICADO",actions:actions.slice(0,8)};
}
