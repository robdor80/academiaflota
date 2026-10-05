import {
  getStorageOwner, getSyncRecords, replaceSyncRecords, getLegacyProfiles,
  rotateGuestProfiles
} from "./storage.js";

function timestamp(record) {
  const value = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

// Empate: gana Firestore. Cada perfil (incluidos los borrados) se resuelve entero.
export function reconcile(localRecords, cloudRecords) {
  const local = new Map(localRecords.map(function(record) { return [record.id, record]; }));
  const cloud = new Map(cloudRecords.map(function(record) { return [record.id, record]; }));
  const merged = [];
  const upload = [];
  for (const id of new Set([...local.keys(), ...cloud.keys()])) {
    const here = local.get(id);
    const there = cloud.get(id);
    const localWins = here && (!there || timestamp(here) > timestamp(there));
    const winner = localWins ? here : there;
    if (winner) merged.push(winner);
    if (localWins) upload.push(here);
  }
  return { merged, upload };
}

export function createSyncManager(cloud, onStatus, onProfiles) {
  let uid = null;
  let running = false;
  let rerun = false;
  let generation = 0;

  async function run() {
    if (!uid || running || getStorageOwner() !== uid) return;
    if (!navigator.onLine) { onStatus("offline"); return; }
    running = true;
    const currentUid = uid;
    const currentGeneration = generation;
    onStatus("syncing");
    try {
      const remote = await cloud.load(currentUid);
      if (generation !== currentGeneration || getStorageOwner() !== currentUid) return;
      const { merged, upload } = reconcile(getSyncRecords(), remote);
      replaceSyncRecords(merged);
      onProfiles();
      for (const record of upload) {
        if (generation !== currentGeneration || getStorageOwner() !== currentUid) return;
        await cloud.save(currentUid, record);
      }
      if (generation === currentGeneration) onStatus("ready");
    } catch (error) {
      if (generation === currentGeneration) {
        onStatus(navigator.onLine ? "error" : "offline", error);
      }
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        if (uid) void run();
      }
    }
  }

  function schedule() {
    if (!uid) return;
    if (running) rerun = true;
    else void run();
  }

  window.addEventListener("online", schedule);
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) schedule();
  });

  return {
    start(nextUid) {
      uid = nextUid;
      generation += 1;
      if (running) rerun = true;
      else void run();
    },
    stop() {
      uid = null;
      generation += 1;
      rerun = false;
    },
    schedule,
    legacyCandidates() {
      return getLegacyProfiles();
    },
    migrateLegacy() {
      if (!uid || getStorageOwner() !== uid) return 0;
      const existing = getSyncRecords();
      const byId = new Map(existing.map(function(record) { return [record.id, record]; }));
      const candidates = this.legacyCandidates();
      for (const profile of candidates) {
        const current = byId.get(profile.id);
        if (!current || timestamp(profile) > timestamp(current)) byId.set(profile.id, profile);
      }
      replaceSyncRecords([...byId.values()]);
      if (candidates.length) rotateGuestProfiles();
      onProfiles();
      schedule();
      return candidates.length;
    }
  };
}
