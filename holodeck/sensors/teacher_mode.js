let listeners=[];
export function emitTeacherEvent(type,data={}){for(const fn of listeners)fn({type,data,at:Date.now()})}
function get(obj,path){return path.split(".").reduce((v,k)=>v?.[k],obj)}
function matches(data,match={}){return Object.entries(match).every(([k,v])=>get(data,k)===v)}
function ruleMatches(rule,ev,stateOk){
  if(rule.event!==ev.type)return false;
  if(rule.match&&!matches(ev.data,rule.match))return false;
  if(rule.matchNot&&matches(ev.data,rule.matchNot))return false;
  if(rule.requiresState&&!stateOk(rule))return false;
  return true;
}
export async function initTeacherMode({resetScenario,logTeacher=()=>{}}){
  const mode=document.querySelector("#mode-select"),panel=document.querySelector("#teacher-panel"),select=document.querySelector("#tutorial-select");
  const title=document.querySelector("#teacher-title"),objective=document.querySelector("#teacher-objective"),stepsEl=document.querySelector("#teacher-steps"),levelLabel=document.querySelector("#teacher-level-label");
  const progressEl=document.querySelector("#teacher-progress"),feedback=document.querySelector("#teacher-feedback"),hintBtn=document.querySelector("#teacher-hint"),hintText=document.querySelector("#teacher-hint-text"),resetBtn=document.querySelector("#teacher-reset");
  const orderBox=document.querySelector("#teacher-order"),orderSource=document.querySelector("#teacher-order-source"),orderText=document.querySelector("#teacher-order-text"),orderNote=document.querySelector("#teacher-order-note"),orderAck=document.querySelector("#teacher-order-ack");
  const orderSummary=document.querySelector("#teacher-order-summary"),orderSummaryText=document.querySelector("#teacher-order-summary-text");
  const expBox=document.querySelector("#teacher-explanation"),expKicker=document.querySelector("#teacher-explanation-kicker"),expTitle=document.querySelector("#teacher-explanation-title"),expWhat=document.querySelector("#teacher-explanation-what"),expWhy=document.querySelector("#teacher-explanation-why"),expEffect=document.querySelector("#teacher-explanation-effect"),expConcept=document.querySelector("#teacher-explanation-concept");
  const data=await fetch("./data/tutorials.json").then(r=>r.json());
  let tutorial=data.tutorials[0],done=new Set(),current=0,orderAcknowledged=false,completionLogged=false;

  function activeProfileName(){
    try{
      const sessionKeys=Object.keys(sessionStorage).filter(k=>k.startsWith("starfleetAcademy.activeProfile.v1"));
      for(const sk of sessionKeys){
        const id=sessionStorage.getItem(sk);if(!id)continue;
        const suffix=sk.slice("starfleetAcademy.activeProfile.v1".length);
        for(const lk of ["starfleetAcademy.profiles.v1"+suffix,"starfleetAcademy.profiles.v1"]){
          const raw=localStorage.getItem(lk);if(!raw)continue;
          const profiles=JSON.parse(raw),p=Array.isArray(profiles)?profiles.find(x=>x?.id===id&&!x?.deletedAt):null;
          if(p?.name)return p.name.trim();
        }
      }
    }catch{}
    return "";
  }
  function formatOrder(text){
    const name=activeProfileName();
    return String(text||"").replaceAll("{name}",name).replace(/Cadete\s+,/g,"Cadete,");
  }
  function buildSelect(){
    select.innerHTML="";
    for(const level of data.levels||[]){
      const group=document.createElement("optgroup");
      group.label="NIVEL "+level.id+" · "+level.title;
      for(const t of data.tutorials.filter(x=>x.level===level.id)){
        const op=document.createElement("option");op.value=t.id;op.textContent=t.id+" · "+t.title;group.appendChild(op);
      }
      select.appendChild(group);
    }
  }
  buildSelect();

  function stateOk(step){
    if(!step.requiresState)return true;
    if(step.requiresState.contactTracked){
      const id=step.requiresState.contactTracked;
      return !![...document.querySelectorAll("[data-track-contact]")].find(x=>x.dataset.trackContact===id);
    }
    return true;
  }
  function stepMatches(step,ev){
    if(step.alternatives?.length)return step.alternatives.some(rule=>ruleMatches(rule,ev,stateOk));
    return ruleMatches(step,ev,stateOk);
  }
  function guidanceClass(){
    panel.classList.remove("guidance-full","guidance-guided","guidance-reduced","guidance-evaluation","practice-complete");
    panel.classList.add("guidance-"+(tutorial.guidance||"full"));
    if(done.size===tutorial.steps.length)panel.classList.add("practice-complete");
  }
  function render(){
    const teacherMode=mode.value==="teacher",complete=done.size===tutorial.steps.length;
    const scenarioSelect=document.querySelector("#scenario-select");if(scenarioSelect)scenarioSelect.disabled=teacherMode;
    const copyBtn=document.querySelector("#copy-exercise-log");if(copyBtn)copyBtn.hidden=!teacherMode;
    guidanceClass();
    title.textContent=tutorial.title;
    objective.textContent=tutorial.objective;
    panel.dataset.tutorialId=tutorial.id;
    panel.dataset.tutorialTitle=tutorial.title;
    panel.dataset.tutorialLevel=String(tutorial.level);
    panel.dataset.scenarioId=tutorial.scenario_id||"";
    levelLabel.textContent="NIVEL "+tutorial.level+" · "+((data.levels||[]).find(x=>x.id===tutorial.level)?.title||"");
    orderBox.hidden=!teacherMode||orderAcknowledged;
    orderSummary.hidden=!teacherMode||!orderAcknowledged;
    orderSummaryText.textContent=tutorial.objective;
    document.querySelector(".console-grid").classList.toggle("teacher-locked",teacherMode&&!orderAcknowledged);
    objective.hidden=!teacherMode||!orderAcknowledged;
    const evaluation=tutorial.guidance==="evaluation";
    stepsEl.hidden=!teacherMode||!orderAcknowledged||(evaluation&&!complete);
    expBox.hidden=!teacherMode||!orderAcknowledged||(evaluation&&!complete);
    if(tutorial.order){
      orderSource.textContent=tutorial.order.source||"Instructor";
      orderText.textContent=formatOrder(tutorial.order.order);
      orderNote.textContent=tutorial.order.note||"";
    }
    progressEl.textContent=done.size+" / "+tutorial.steps.length;
    stepsEl.innerHTML=tutorial.steps.map((s,i)=>'<li class="teacher-step '+(done.has(i)?"done":i===current?"current":"")+'">'+s.label+'</li>').join("");
    if(complete){
      expKicker.textContent="PRÁCTICA COMPLETADA";
      expTitle.textContent="Debrief del instructor";
      expWhat.textContent=tutorial.lesson_summary||tutorial.completion_feedback;
      expWhy.textContent="La secuencia ha sido validada contra acciones reales de la consola.";
      expEffect.textContent="Repite el escenario en Modo Libre para comprobar que puedes resolverlo sin apoyo.";
      expConcept.textContent="El objetivo es transferir criterio operativo, no memorizar una ruta fija.";
      feedback.hidden=false;feedback.textContent="✓ "+tutorial.completion_feedback;
      if(!completionLogged){logTeacher("PRÁCTICA COMPLETADA · "+tutorial.id+" · "+tutorial.title);completionLogged=true}
    }else{
      const step=tutorial.steps[current]||{};
      expKicker.textContent="PASO "+(current+1)+" DE "+tutorial.steps.length;
      expTitle.textContent=step.label||"Objetivo en curso";
      expWhat.textContent=step.what||"Interpreta la orden y decide la acción adecuada.";
      expWhy.textContent=step.why||"En este nivel debes aplicar criterio sin una ruta prescrita.";
      expEffect.textContent=step.effect||"La consola evaluará el efecto real de tu decisión.";
      expConcept.textContent=step.concept||"Prioriza procedimiento, evidencia y límites de cada consola.";
      feedback.hidden=true;feedback.textContent="";
    }
    hintBtn.textContent=hintText.hidden?(evaluation?"Pista de emergencia":"Mostrar pista"):"Ocultar pista";
  }
  function start(id,{reset=true}={}){
    tutorial=data.tutorials.find(t=>t.id===id)||data.tutorials[0];
    select.value=tutorial.id;done=new Set();current=0;orderAcknowledged=false;completionLogged=false;
    hintText.hidden=true;hintText.textContent=tutorial.hint||"Analiza la orden y opera según procedimiento.";
    if(reset)resetScenario("teacher:"+tutorial.id,tutorial.scenario_id);
    render();
  }
  function resetTeachingOnly(){
    done=new Set();current=0;orderAcknowledged=false;completionLogged=false;
    hintText.hidden=true;hintText.textContent=tutorial.hint||"";render();
  }
  function onEvent(ev){
    if(mode.value==="teacher"&&ev.type==="SCENARIO_RESET"&&ev.data?.source==="manual"){
      resetTeachingOnly();return;
    }
    if(mode.value!=="teacher"||!orderAcknowledged||done.size===tutorial.steps.length)return;
    let advanced=false;
    while(current<tutorial.steps.length&&stepMatches(tutorial.steps[current],ev)){
      const step=tutorial.steps[current];
      done.add(current);
      logTeacher("PASO "+(current+1)+" VALIDADO · "+tutorial.id+" · "+step.label);
      current++;advanced=true;
    }
    if(advanced)render();
  }
  listeners.push(onEvent);

  mode.addEventListener("change",()=>{
    const teacherMode=mode.value==="teacher";panel.hidden=!teacherMode;sessionStorage.setItem("sensorMode",mode.value);
    if(teacherMode)start(select.value,{reset:true});
    else{orderAcknowledged=false;document.querySelector(".console-grid").classList.remove("teacher-locked");render()}
  });
  select.addEventListener("change",()=>start(select.value,{reset:true}));
  resetBtn.addEventListener("click",()=>start(tutorial.id,{reset:true}));
  orderAck.addEventListener("click",()=>{
    orderAcknowledged=true;
    logTeacher("ORDEN RECIBIDA · "+tutorial.id+" · "+formatOrder(tutorial.order?.order||tutorial.objective));
    render();
  });
  hintBtn.addEventListener("click",()=>{hintText.hidden=!hintText.hidden;render()});

  const saved=sessionStorage.getItem("sensorMode");
  if(saved==="teacher"){mode.value="teacher";panel.hidden=false;start(select.value,{reset:true})}
  else{mode.value="free";panel.hidden=true;document.querySelector(".console-grid").classList.remove("teacher-locked");render()}
}
