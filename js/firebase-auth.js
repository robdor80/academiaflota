export function observeUser(client, callback, onError) {
  return client.authSdk.onAuthStateChanged(client.auth, callback, onError);
}

export async function signInWithGoogle(client) {
  const provider = new client.authSdk.GoogleAuthProvider();
  return client.authSdk.signInWithPopup(client.auth, provider);
}

export function signOutGoogle(client) {
  return client.authSdk.signOut(client.auth);
}
