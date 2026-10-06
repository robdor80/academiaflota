let listeners=[];
export function emitTeacherEvent(type,data={}){for(const fn of listeners)fn({type,data,at:Date.now()})}
function get(obj,path){return path.split(".").reduce((v,k)=>v?.[k],obj)}
function matches(data,match={}){return Object.entries(match).every(([k,v])=>get(data,k)===v)}
export async function initTeacherMode({resetScenario}){
  const mode=document.querySelector("#mode-select"),panel=document.querySelector("#teacher-panel"),select=document.querySelector("#tutorial-select");
  const title=document.querySelector("#teacher-title"),objective=document.querySelector("#teacher-objective"),stepsEl=document.querySelector("#teacher-steps");
  const progressEl=document.querySelector("#teacher-progress"),feedback=document.querySelector("#teacher-feedback"),hintBtn=document.querySelector("#teacher-hint"),hintText=document.querySelector("#teacher-hint-text"),resetBtn=document.querySelector("#teacher-reset");
  const orderBox=document.querySelector("#teacher-order"),orderSource=document.querySelector("#teacher-order-source"),orderText=document.querySelector("#teacher-order-text"),orderNote=document.querySelector("#teacher-order-note"),orderAck=document.querySelector("#teacher-order-ack");
  const expKicker=document.querySelector("#teacher-explanation-kicker"),expTitle=document.querySelector("#teacher-explanation-title"),expWhat=document.querySelector("#teacher-explanation-what"),expWhy=document.querySelector("#teacher-explanation-why"),expEffect=document.querySelector("#teacher-explanation-effect"),expConcept=document.querySelector("#teacher-explanation-concept");
  const data=await fetch("./data/tutorials.json").then(r=>r.json());
  let tutorial=data.tutorials[0],done=new Set(),current=0,orderAcknowledged=false;
  function activeProfileName(){
    try{
      const sessionKeys=Object.keys(sessionStorage).filter(k=>k.startsWith("starfleetAcademy.activeProfile.v1"));
      for(const sk of sessionKeys){
        const id=sessionStorage.getItem(sk); if(!id) continue;
        const suffix=sk.slice("starfleetAcademy.activeProfile.v1".length);
        const candidates=[
          "starfleetAcademy.profiles.v1"+suffix,
          "starfleetAcademy.profiles.v1"
        ];
        for(const lk of candidates){
          const raw=localStorage.getItem(lk); if(!raw) continue;
          const profiles=JSON.parse(raw);
          const p=Array.isArray(profiles)?profiles.find(x=>x?.id===id&&!x?.deletedAt):null;
          if(p?.name) return p.name.trim();
        }
      }
    }catch{}
    return "Cadete";
  }
  function formatOrder(text){
    const name=activeProfileName();
    return String(text||"").replaceAll("{name}",name==="Cadete"?"":name).replace(/Cadete\s+,/g,"Cadete,");
  }
  select.innerHTML=data.tutorials.map(t=>'<option value="'+t.id+'">'+t.id+' · '+t.title+'</option>').join("");
  function stateOk(step){
    if(!step.requiresState)return true;
    if(step.requiresState.contactTracked){
      const id=step.requiresState.contactTracked;
      const btn=[...document.querySelectorAll("[data-track-contact]")].find(x=>x.dataset.trackContact===id);
      return !!btn;
    }
    return true;
  }
  function stepMatches(step,ev){
    if(step.event!==ev.type)return false;
    if(step.match && !matches(ev.data,step.match))return false;
    if(step.matchNot && matches(ev.data,step.matchNot))return false;
    return stateOk(step);
  }
  function render(){
    title.textContent=tutorial.title;objective.textContent=tutorial.objective;
    const teacherMode=mode.value==="teacher";
    orderBox.hidden=!teacherMode||orderAcknowledged;
    document.querySelector(".console-grid").classList.toggle("teacher-locked",teacherMode&&!orderAcknowledged);
    objective.hidden=!teacherMode||!orderAcknowledged;
    stepsEl.hidden=!teacherMode||!orderAcknowledged;
    document.querySelector("#teacher-explanation").hidden=!teacherMode||!orderAcknowledged;
    if(tutorial.order){
      orderSource.textContent=tutorial.order.source||"Instructor";
      orderText.textContent=formatOrder(tutorial.order.order);
      orderNote.textContent=tutorial.order.note||"";
    }
    progressEl.textContent=done.size+" / "+tutorial.steps.length;
    stepsEl.innerHTML=tutorial.steps.map((s,i)=>'<li class="teacher-step '+(done.has(i)?"done":i===current?"current":"")+'">'+s.label+'</li>').join("");
    const complete=done.size===tutorial.steps.length;
    if(complete){
      expKicker.textContent="PRÁCTICA COMPLETADA";
      expTitle.textContent="Qué has aprendido";
      expWhat.textContent=tutorial.lesson_summary||tutorial.completion_feedback;
      expWhy.textContent="La secuencia ya está validada; ahora lo importante es comprender el criterio operativo para poder aplicarlo en situaciones diferentes.";
      expEffect.textContent="Puedes repetir el flujo en Modo Libre sin asistencia y probar variantes.";
      expConcept.textContent="Comprender el procedimiento es más importante que memorizar botones.";
      feedback.hidden=false;feedback.textContent="✓ "+tutorial.completion_feedback;
    }else{
      const step=tutorial.steps[current];
      expKicker.textContent="PASO "+(current+1)+" DE "+tutorial.steps.length;
      expTitle.textContent=step.label;
      expWhat.textContent=step.what||"";
      expWhy.textContent=step.why||"";
      expEffect.textContent=step.effect||"";
      expConcept.textContent=step.concept||"";
      feedback.hidden=true;feedback.textContent="";
    }
  }
  function start(id,{reset=true}={}){
    tutorial=data.tutorials.find(t=>t.id===id)||data.tutorials[0];select.value=tutorial.id;done=new Set();current=0;orderAcknowledged=false;hintText.hidden=true;hintText.textContent=tutorial.hint;hintBtn.textContent="Mostrar pista";
    if(reset)resetScenario("teacher:"+tutorial.id);render();
  }
  function onEvent(ev){
    if(mode.value!=="teacher"||!orderAcknowledged||done.size===tutorial.steps.length)return;
    let advanced=false;
    while(current<tutorial.steps.length && stepMatches(tutorial.steps[current],ev)){
      done.add(current);current++;advanced=true;
    }
    if(advanced)render();
  }
  listeners.push(onEvent);
  mode.addEventListener("change",()=>{
    const teacherMode=mode.value==="teacher";
    panel.hidden=!teacherMode;
    sessionStorage.setItem("sensorMode",mode.value);
    if(teacherMode){
      start(select.value,{reset:true});
    }else{
      orderAcknowledged=false;
      document.querySelector(".console-grid").classList.remove("teacher-locked");
      render();
    }
  });
  select.addEventListener("change",()=>start(select.value,{reset:true}));
  resetBtn.addEventListener("click",()=>start(tutorial.id,{reset:true}));
  orderAck.addEventListener("click",()=>{orderAcknowledged=true;render();});
  hintBtn.addEventListener("click",()=>{hintText.hidden=!hintText.hidden;hintBtn.textContent=hintText.hidden?"Mostrar pista":"Ocultar pista"});
  const saved=sessionStorage.getItem("sensorMode");
  if(saved==="teacher"){
    mode.value="teacher";panel.hidden=false;start(select.value,{reset:false});
  }else{
    mode.value="free";panel.hidden=true;document.querySelector(".console-grid").classList.remove("teacher-locked");
  }
  render();
}
