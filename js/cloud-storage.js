export function createCloudStorage(client) {
  const sdk = client.fireSdk;
  function profiles(uid) {
    return sdk.collection(client.db, "users", uid, "profiles");
  }
  return {
    async load(uid) {
      const snapshot = await sdk.getDocsFromServer(profiles(uid));
      return snapshot.docs.map(function(item) { return item.data(); });
    },
    save(uid, record) {
      return sdk.setDoc(sdk.doc(profiles(uid), record.id), record);
    }
  };
}
