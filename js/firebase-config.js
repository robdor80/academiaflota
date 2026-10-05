// Copia aquí los valores de "Configuración del SDK" de tu aplicación Web.
// Son identificadores públicos; nunca pongas aquí claves privadas de servicio.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};

export const firebaseConfigured = ["apiKey", "authDomain", "projectId", "appId"]
  .every(function(key) { return Boolean(firebaseConfig[key]); });
