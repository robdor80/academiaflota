import {initializeApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,GoogleAuthProvider,setPersistence,browserLocalPersistence,
  signInWithPopup,signOut,onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,doc,getDoc,setDoc,serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyAxRL5F0b77B1SdzeBmvDVurgNEUvWUV_M",
  authDomain:"gen-lang-client-0682280416.firebaseapp.com",
  projectId:"gen-lang-client-0682280416",
  storageBucket:"gen-lang-client-0682280416.firebasestorage.app",
  messagingSenderId:"996229695539",
  appId:"1:996229695539:web:0f46c4cde4cd6ee0d3bb46"
};

const DEFAULTS={
  defaultModel:"gemini-3.5-flash-lite",
  escalationModel:"gemini-3.8-flash",
  routingMode:"auto"
};

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const googleProvider=new GoogleAuthProvider();

let runtime={
  ready:false,
  user:null,
  config:null,
  error:null
};

let resolveReady;
const readyPromise=new Promise(resolve=>{resolveReady=resolve});
let readyResolved=false;

function publicState(){
  return {
    ready:runtime.ready,
    user:runtime.user?{
      uid:runtime.user.uid,
      displayName:runtime.user.displayName||"",
      email:runtime.user.email||""
    }:null,
    configured:!!runtime.config?.geminiApiKey,
    defaultModel:runtime.config?.defaultModel||DEFAULTS.defaultModel,
    escalationModel:runtime.config?.escalationModel||DEFAULTS.escalationModel,
    routingMode:runtime.config?.routingMode||DEFAULTS.routingMode,
    error:runtime.error?String(runtime.error.message||runtime.error):null
  };
}

function emit(){
  const detail=publicState();
  window.dispatchEvent(new CustomEvent("star-trek-computer-cloud",{detail}));
  renderCloudUI(detail);
}

function configRef(user=auth.currentUser){
  if(!user)throw new Error("No hay una sesión autenticada.");
  return doc(db,"users",user.uid,"private","computer");
}

async function loadConfig(user){
  const snap=await getDoc(configRef(user));
  if(!snap.exists())return null;
  const data=snap.data()||{};
  return {
    geminiApiKey:String(data.geminiApiKey||"").trim(),
    defaultModel:String(data.defaultModel||DEFAULTS.defaultModel),
    escalationModel:String(data.escalationModel||DEFAULTS.escalationModel),
    routingMode:String(data.routingMode||DEFAULTS.routingMode)
  };
}

export async function initComputerCloud(){
  await readyPromise;
  return publicState();
}

export function getComputerCloudState(){
  return publicState();
}

export function getComputerConfig(){
  if(!runtime.config?.geminiApiKey)return null;
  return {...runtime.config};
}

export async function signInComputer(){
  await setPersistence(auth,browserLocalPersistence);
  return signInWithPopup(auth,googleProvider);
}

export async function signOutComputer(){
  await signOut(auth);
}

export async function saveComputerConfig(values={}){
  const user=auth.currentUser;
  if(!user)throw new Error("Inicia sesión con Google antes de guardar la configuración.");
  const current=runtime.config||{};
  const key=String(values.geminiApiKey||current.geminiApiKey||"").trim();
  if(!key)throw new Error("Falta la clave API de Gemini.");

  const payload={
    geminiApiKey:key,
    defaultModel:String(values.defaultModel||current.defaultModel||DEFAULTS.defaultModel).trim(),
    escalationModel:String(values.escalationModel||current.escalationModel||DEFAULTS.escalationModel).trim(),
    routingMode:String(values.routingMode||current.routingMode||DEFAULTS.routingMode).trim(),
    updatedAt:serverTimestamp()
  };
  await setDoc(configRef(user),payload,{merge:true});
  runtime.config={...payload,updatedAt:undefined};
  runtime.error=null;
  emit();
  return publicState();
}

function byId(id){return document.getElementById(id)}

function setUiMessage(text,kind=""){
  const el=byId("cloud-message");
  if(!el)return;
  el.textContent=text||"";
  el.dataset.kind=kind;
}

function renderCloudUI(s=publicState()){
  const status=byId("cloud-status");
  const userText=byId("cloud-user-text");
  const signedOut=byId("cloud-signed-out");
  const signedIn=byId("cloud-signed-in");
  const keyState=byId("cloud-key-state");
  const modelState=byId("cloud-model-state");

  if(status){
    status.textContent=!s.ready?"IA · CONECTANDO":!s.user?"IA · SIN SESIÓN":s.configured?"IA · LISTA":"IA · CONFIGURAR";
    status.classList.toggle("ready",!!s.configured);
    status.classList.toggle("warn",!!s.ready&&(!s.user||!s.configured));
  }
  if(userText)userText.textContent=s.user?(s.user.displayName||s.user.email||"Cuenta Google"):"";
  if(signedOut)signedOut.hidden=!!s.user;
  if(signedIn)signedIn.hidden=!s.user;
  if(keyState)keyState.textContent=s.configured?"Clave Gemini guardada en tu Firestore privado.":"Aún no hay una clave Gemini guardada.";
  if(modelState)modelState.textContent=s.defaultModel+" · escalado "+s.escalationModel;

  const badge=byId("ai-badge");
  if(badge&&s.configured&&badge.textContent==="INTÉRPRETE LOCAL")badge.textContent="GEMINI · LISTO";
  if(s.error)setUiMessage(s.error,"error");
}

function openCloudDialog(){
  const dialog=byId("cloud-dialog");
  if(dialog&&!dialog.open)dialog.showModal();
}

function bindCloudUI(){
  const open=byId("cloud-config-button");
  const login=byId("cloud-login");
  const save=byId("cloud-save");
  const logout=byId("cloud-logout");
  const dialog=byId("cloud-dialog");
  if(open)open.onclick=()=>{setUiMessage("");openCloudDialog()};
  if(login)login.onclick=async()=>{
    setUiMessage("Abriendo acceso de Google…");
    login.disabled=true;
    try{
      await signInComputer();
      setUiMessage("");
      if(!getComputerConfig())setUiMessage("Sesión iniciada. Pega ahora tu clave API de Gemini y guárdala.");
    }catch(e){
      setUiMessage(e.message||String(e),"error");
    }finally{login.disabled=false}
  };
  if(save)save.onclick=async()=>{
    const key=byId("cloud-api-key")?.value||"";
    const defaultModel=byId("cloud-default-model")?.value||DEFAULTS.defaultModel;
    const escalationModel=byId("cloud-escalation-model")?.value||DEFAULTS.escalationModel;
    save.disabled=true;setUiMessage("Guardando configuración…");
    try{
      await saveComputerConfig({geminiApiKey:key,defaultModel,escalationModel});
      if(byId("cloud-api-key"))byId("cloud-api-key").value="";
      setUiMessage("Configuración guardada. La Computadora ya puede usar Gemini.","ok");
    }catch(e){
      setUiMessage(e.message||String(e),"error");
    }finally{save.disabled=false}
  };
  if(logout)logout.onclick=async()=>{
    logout.disabled=true;
    try{
      await signOutComputer();
      setUiMessage("Sesión cerrada.");
    }catch(e){
      setUiMessage(e.message||String(e),"error");
    }finally{logout.disabled=false}
  };
  if(dialog)dialog.addEventListener("close",()=>setUiMessage(""));
}

setPersistence(auth,browserLocalPersistence).catch(()=>{});

onAuthStateChanged(auth,async user=>{
  runtime.user=user||null;
  runtime.config=null;
  runtime.error=null;
  try{
    if(user)runtime.config=await loadConfig(user);
  }catch(e){
    runtime.error=e;
  }
  runtime.ready=true;
  if(!readyResolved){readyResolved=true;resolveReady(publicState())}
  emit();
});

bindCloudUI();
renderCloudUI();
