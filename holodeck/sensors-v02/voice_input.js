export function createVoiceController({onTranscript,onStatus}={}){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition=null,listening=false;
  if(SR){
    recognition=new SR();
    recognition.lang="es-ES";
    recognition.continuous=false;
    recognition.interimResults=true;
    recognition.maxAlternatives=1;
    recognition.onstart=()=>{listening=true;onStatus?.("Escuchando…",true)};
    recognition.onend=()=>{listening=false;onStatus?.("",false)};
    recognition.onerror=e=>{listening=false;onStatus?.("Error de voz: "+e.error,false)};
    recognition.onresult=e=>{
      let text="";
      for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;
      onTranscript?.(text.trim(),e.results[e.results.length-1]?.isFinal===true);
    };
  }
  return {
    supported:!!recognition,
    start(){
      if(!recognition){onStatus?.("El navegador no ofrece reconocimiento de voz. La entrada queda preparada para el adaptador de voz Gemini.",false);return false}
      if(listening){recognition.stop();return true}
      try{recognition.start();return true}catch(e){onStatus?.("No se pudo iniciar el micrófono.",false);return false}
    },
    stop(){if(recognition&&listening)recognition.stop()},
    get listening(){return listening}
  };
}
