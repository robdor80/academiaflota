export const firebaseConfig = {
  apiKey: "AIzaSyACq3sA4RjJzERPegCGO9bzfiegs2ZxrLA",
  authDomain: "webacademiastarfleet.firebaseapp.com",
  projectId: "webacademiastarfleet",
  storageBucket: "webacademiastarfleet.firebasestorage.app",
  messagingSenderId: "690204685140",
  appId: "1:690204685140:web:acc17aac56799ec4bf0ec1"
};

export const firebaseConfigured = ["apiKey", "authDomain", "projectId", "appId"]
  .every(function(key) { return Boolean(firebaseConfig[key]); });
