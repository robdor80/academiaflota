import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcile, createSyncManager } from "../js/sync.js";
import {
  setStorageOwner, getStorageOwner, getProfiles, getSyncRecords, getLegacyProfiles,
  createProfile, updateProfile, deleteProfile, setActiveProfile, getActiveProfile,
  importProfile, onProfileChange, replaceSyncRecords, rotateGuestProfiles
} from "../js/storage.js";
import { firebaseConfigured, firebaseConfig } from "../js/firebase-config.js";

function browserStore() {
  const items = new Map();
  return {
    getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key)
  };
}

globalThis.localStorage = browserStore();
globalThis.sessionStorage = browserStore();
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
globalThis.window = { addEventListener() {} };
globalThis.document = { hidden: false, addEventListener() {} };

function waitForReady(register) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Sincronización no terminó")), 1000);
    register((state, error) => {
      if (state === "error") { clearTimeout(timeout); reject(error); }
      if (state === "ready") { clearTimeout(timeout); resolve(); }
    });
  });
}

test("gana updatedAt más reciente y un borrado no resucita", () => {
  const local = [{ id: "A", updatedAt: "2026-10-05T10:00:00Z", deletedAt: "2026-10-05T10:00:00Z" }];
  const cloud = [{ id: "A", updatedAt: "2026-10-04T10:00:00Z", name: "A" }];
  const result = reconcile(local, cloud);
  assert.equal(result.merged[0].deletedAt, local[0].deletedAt);
  assert.equal(result.upload.length, 1);
  assert.equal(reconcile(cloud, cloud).upload.length, 0);
});

test("otro dispositivo recibe progreso, práctica y test sin perder campos", () => {
  const fromMobile = {
    id: "Kazan", name: "Kazan Rise", updatedAt: "2026-10-05T12:00:00Z",
    studies: { acceso: { completedModules: [] }, sensores: { completedModules: ["01", "02"] } },
    practices: { sensores: { completed: ["E-01"], answers: { "E-01": "Plan" } } },
    evaluations: { sensores: { attempts: [{ score: 90 }] } },
    extra: { preserved: true }
  };
  const result = reconcile([], [fromMobile]);
  assert.deepEqual(result.merged[0], fromMobile);
  assert.equal(result.upload.length, 0);
});

test("las cuentas tienen cachés separadas y el borrado se guarda como tombstone", () => {
  setStorageOwner(null);
  const legacy = createProfile("Kazan Rise");
  assert.equal(getLegacyProfiles().length, 1);
  setStorageOwner("user-a");
  assert.equal(getProfiles().length, 0);
  const profile = createProfile("Kazan Rise");
  setActiveProfile(profile.id);
  profile.studies.sensores.completedModules.push("01");
  profile.practices.sensores.answers["E-01"] = "Plan";
  profile.evaluations.sensores.attempts.push({ score: 90 });
  updateProfile(profile);
  deleteProfile(profile.id);
  assert.equal(getProfiles().length, 0);
  assert.equal(getSyncRecords()[0].studies.sensores.completedModules[0], "01");
  assert.equal(getSyncRecords()[0].practices.sensores.answers["E-01"], "Plan");
  assert.equal(getSyncRecords()[0].evaluations.sensores.attempts[0].score, 90);
  assert.ok(getSyncRecords()[0].deletedAt);
  setStorageOwner("user-b");
  assert.equal(getProfiles().length, 0);
  assert.equal(getActiveProfile(), null);
  setStorageOwner("user-a");
  assert.equal(getActiveProfile(), null); // El perfil se borró en esta cuenta.
  setStorageOwner(null);
  assert.equal(getProfiles()[0].id, legacy.id);
});

test("migración conserva el perfil anterior y lo envía a la cuenta una sola vez", async () => {
  const uploaded = [];
  const cloud = {
    load: async () => [],
    save: async (uid, record) => uploaded.push({ uid, record })
  };
  setStorageOwner("user-migrate");
  let manager;
  await waitForReady(onStatus => {
    manager = createSyncManager(cloud, onStatus, () => {});
    manager.start("user-migrate");
  });
  assert.equal(manager.legacyCandidates().length, 1);
  await waitForReady(onStatus => {
    // La segunda llamada conserva el mismo gestor y espera su siguiente ciclo.
    const original = cloud.save;
    cloud.save = async (...args) => { await original(...args); onStatus("ready"); };
    manager.migrateLegacy();
  });
  assert.equal(manager.legacyCandidates().length, 0);
  assert.equal(getProfiles()[0].name, "Kazan Rise");
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].uid, "user-migrate");
  manager.stop();
  setStorageOwner(null);
  assert.equal(getProfiles().length, 0);
  const newGuest = createProfile("Otro invitado");
  assert.equal(getProfiles()[0].id, newGuest.id);
  setStorageOwner("user-other");
  assert.deepEqual(manager.legacyCandidates().map(p => p.id), [newGuest.id]);
});

test("un cambio sin conexión permanece local y se sube al reanudar", async () => {
  setStorageOwner("user-offline");
  const profile = createProfile("Sin conexión");
  profile.studies.sensores.completedModules.push("02");
  updateProfile(profile);
  const uploaded = [];
  let state = "";
  let ready;
  const done = new Promise(resolve => { ready = resolve; });
  const manager = createSyncManager({
    load: async () => [],
    save: async (_uid, record) => { uploaded.push(record); }
  }, next => { state = next; if (next === "ready") ready(); }, () => {});
  navigator.onLine = false;
  manager.start("user-offline");
  assert.equal(state, "offline");
  assert.deepEqual(getProfiles()[0].studies.sensores.completedModules, ["02"]);
  navigator.onLine = true;
  manager.schedule();
  await done;
  assert.equal(uploaded.length, 1);
  assert.deepEqual(uploaded[0].studies.sensores.completedModules, ["02"]);
  manager.stop();
});

test("la configuración Firebase está completa y apunta al proyecto previsto", () => {
  assert.equal(firebaseConfigured, true);
  assert.equal(firebaseConfig.projectId, "webacademiastarfleet");
  assert.equal(firebaseConfig.authDomain, "webacademiastarfleet.firebaseapp.com");
});

test("los cursos nuevos y los campos futuros sobreviven a edición e importación", async () => {
  setStorageOwner("user-courses");
  const changed = [];
  onProfileChange(profile => changed.push(profile.id));
  const profile = createProfile("Alumno de cursos");
  profile.studies["STF-401"] = { completedModules: ["STF-401-U01"], customNote: "conservar" };
  profile.studies["ENG-303"] = { completedModules: ["ENG-303-U02"] };
  profile.futureFeature = { level: 7 };
  profile.schemaVersion = 2;
  updateProfile(profile);
  assert.deepEqual(getProfiles()[0].studies["STF-401"], profile.studies["STF-401"]);
  assert.deepEqual(getProfiles()[0].studies["ENG-303"], profile.studies["ENG-303"]);
  assert.deepEqual(getProfiles()[0].futureFeature, profile.futureFeature);
  assert.equal(getProfiles()[0].schemaVersion, 2);
  await importProfile({
    size: 100,
    text: async () => JSON.stringify({ format: "starfleet-academy-profile", profile })
  });
  assert.equal(getProfiles().length, 1);
  assert.deepEqual(getProfiles()[0].studies["STF-401"], profile.studies["STF-401"]);
  deleteProfile(profile.id);
  assert.deepEqual(changed, [profile.id, profile.id, profile.id, profile.id]);
  assert.equal(getProfiles().length, 0);
  assert.ok(getSyncRecords()[0].deletedAt);
  onProfileChange(null);
});

test("migrar un profileId ya existente no duplica ni pisa la versión más reciente", async () => {
  setStorageOwner(null);
  rotateGuestProfiles();
  const legacy = createProfile("Perfil existente");
  const newer = { ...legacy, updatedAt: "2099-01-01T00:00:00.000Z", futureFeature: true };
  setStorageOwner("user-existing");
  replaceSyncRecords([newer]);
  const manager = createSyncManager({ load: async () => [newer], save: async () => {} }, () => {}, () => {});
  manager.start("user-existing");
  assert.equal(manager.migrateLegacy(), 1);
  assert.equal(getSyncRecords().length, 1);
  assert.equal(getSyncRecords()[0].futureFeature, true);
  assert.equal(manager.legacyCandidates().length, 0);
  manager.stop();
});

test("todos los cursos publicados en el currículo tienen JSON de unidades", () => {
  const curriculum = JSON.parse(readFileSync(new URL("../data/curriculum.json", import.meta.url), "utf8"));
  let courses = 0;
  for (const year of curriculum.years) {
    for (const term of year.trimesters) {
      for (const subject of term.subjects) {
        if (subject.source !== "course") continue;
        const material = JSON.parse(readFileSync(new URL("../" + subject.dataFile, import.meta.url), "utf8"));
        assert.equal(material.code, subject.courseId);
        assert.equal(material.modules.length, subject.unitCount);
        courses += 1;
      }
    }
  }
  assert.ok(courses >= 60);
  for (const branch of curriculum.branches || []) {
    const material = JSON.parse(readFileSync(new URL("../" + branch.dataFile, import.meta.url), "utf8"));
    assert.equal(material.modules.length, branch.unitCount);
  }
});

test("una respuesta tardía de la cuenta A no contamina la caché de B", async () => {
  setStorageOwner("user-race-a");
  const profileA = createProfile("Solo A");
  let resolveA;
  let readyB;
  const statuses = [];
  const finishedB = new Promise(resolve => { readyB = resolve; });
  const manager = createSyncManager({
    load: uid => uid === "user-race-a"
      ? new Promise(resolve => { resolveA = resolve; })
      : Promise.resolve([]),
    save: async () => {}
  }, state => {
    statuses.push(state);
    if (state === "ready" && getStorageOwner() === "user-race-b") readyB();
  }, () => {});
  manager.start("user-race-a");
  setStorageOwner("user-race-b");
  manager.start("user-race-b");
  resolveA([{ ...profileA, name: "Filtrado" }]);
  let timeout;
  try {
    await Promise.race([
      finishedB,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("B no terminó: " + statuses.join(","))), 1000);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
  assert.deepEqual(getProfiles(), []);
  setStorageOwner("user-race-a");
  assert.equal(getProfiles()[0].name, "Solo A");
  manager.stop();
});
