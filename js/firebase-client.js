import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";

export async function createFirebaseClient() {
  if (!firebaseConfigured) return null;
  const [appSdk, authSdk, fireSdk] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]);
  const firebaseApp = appSdk.initializeApp(firebaseConfig);
  return {
    auth: authSdk.getAuth(firebaseApp),
    db: fireSdk.getFirestore(firebaseApp),
    authSdk: authSdk,
    fireSdk: fireSdk
  };
}
