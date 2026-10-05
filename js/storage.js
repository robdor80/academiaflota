const STORAGE_KEY = "starfleetAcademy.profiles.v1";
const SESSION_KEY = "starfleetAcademy.activeProfile.v1";
const GUEST_GENERATION_KEY = "starfleetAcademy.guestGeneration.v1";
let ownerId = null;
let onChange = null;

function guestGeneration() { return Number(localStorage.getItem(GUEST_GENERATION_KEY) || 0); }
function guestProfilesKey() { return guestGeneration() ? STORAGE_KEY + ".guest." + guestGeneration() : STORAGE_KEY; }
function profilesKey() { return ownerId ? STORAGE_KEY + ".user." + ownerId : guestProfilesKey(); }
function sessionKey() { return ownerId ? SESSION_KEY + ".user." + ownerId : (guestGeneration() ? SESSION_KEY + ".guest." + guestGeneration() : SESSION_KEY); }

export function setStorageOwner(uid) { ownerId = uid || null; }
export function getStorageOwner() { return ownerId; }
export function onProfileChange(listener) { onChange = listener; }
export function rotateGuestProfiles() { localStorage.setItem(GUEST_GENERATION_KEY, String(guestGeneration() + 1)); }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyProfile(name) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID ? crypto.randomUUID() : "cadet-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    studies: { acceso: { completedModules: [] }, sensores: { completedModules: [] } },
    practices: { sensores: { completed: [], answers: {} } },
    evaluations: { sensores: { attempts: [] } }
  };
}

function normalizeProfile(profile) {
  const p = clone(profile);
  if (!p || typeof p.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(p.id) ||
      typeof p.name !== "string" || !p.name.trim()) {
    throw new Error("El perfil tiene un identificador o nombre inválido.");
  }
  p.schemaVersion = 1;
  p.studies = p.studies && typeof p.studies === "object" ? p.studies : {};
  p.studies.acceso = p.studies.acceso && typeof p.studies.acceso === "object" ? p.studies.acceso : { completedModules: [] };
  p.studies.acceso.completedModules = Array.isArray(p.studies.acceso.completedModules) ? p.studies.acceso.completedModules : [];
  p.studies.sensores = p.studies.sensores && typeof p.studies.sensores === "object" ? p.studies.sensores : { completedModules: [] };
  p.studies.sensores.completedModules = Array.isArray(p.studies.sensores.completedModules) ? p.studies.sensores.completedModules : [];
  p.practices = p.practices && typeof p.practices === "object" ? p.practices : {};
  p.practices.sensores = p.practices.sensores && typeof p.practices.sensores === "object" ? p.practices.sensores : { completed: [], answers: {} };
  p.practices.sensores.completed = Array.isArray(p.practices.sensores.completed) ? p.practices.sensores.completed : [];
  p.practices.sensores.answers = p.practices.sensores.answers && typeof p.practices.sensores.answers === "object" ? p.practices.sensores.answers : {};
  p.evaluations = p.evaluations && typeof p.evaluations === "object" ? p.evaluations : {};
  p.evaluations.sensores = p.evaluations.sensores && typeof p.evaluations.sensores === "object" ? p.evaluations.sensores : { attempts: [] };
  p.evaluations.sensores.attempts = Array.isArray(p.evaluations.sensores.attempts) ? p.evaluations.sensores.attempts : [];
  return p;
}

export function getProfiles() {
  return getSyncRecords().filter(function(profile) { return !profile.deletedAt; });
}

export function getSyncRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(profilesKey()) || "[]");
    return Array.isArray(raw) ? raw.map(normalizeProfile) : [];
  } catch {
    return [];
  }
}

export function getLegacyProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(guestProfilesKey()) || "[]");
    return Array.isArray(raw) ? raw.map(normalizeProfile).filter(function(p) { return !p.deletedAt; }) : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(profilesKey(), JSON.stringify(profiles));
}

export function replaceSyncRecords(records) { saveProfiles(records.map(normalizeProfile)); }

function changed(profile) { if (ownerId && onChange) onChange(profile); }

export function createProfile(name) {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre del alumno es obligatorio.");
  const profile = emptyProfile(clean);
  const profiles = getSyncRecords();
  profiles.push(profile);
  saveProfiles(profiles);
  changed(profile);
  return profile;
}

export function setActiveProfile(id) {
  sessionStorage.setItem(sessionKey(), id);
}

export function clearActiveProfile() {
  sessionStorage.removeItem(sessionKey());
}

export function getActiveProfile() {
  const id = sessionStorage.getItem(sessionKey());
  if (!id) return null;
  return getProfiles().find(function(profile) { return profile.id === id; }) || null;
}

export function updateProfile(profile) {
  const profiles = getSyncRecords();
  const index = profiles.findIndex(function(item) { return item.id === profile.id; });
  if (index < 0) throw new Error("El expediente ya no existe.");
  const normalized = normalizeProfile(profile);
  normalized.updatedAt = new Date().toISOString();
  profiles[index] = normalized;
  saveProfiles(profiles);
  changed(normalized);
  return normalized;
}

export function deleteProfile(id) {
  const profiles = getSyncRecords();
  const index = profiles.findIndex(function(profile) { return profile.id === id; });
  if (index < 0) return;
  if (ownerId) {
    const now = new Date().toISOString();
    profiles[index] = { ...profiles[index], deletedAt: now, updatedAt: now };
    saveProfiles(profiles);
    changed(profiles[index]);
  } else {
    profiles.splice(index, 1);
    saveProfiles(profiles);
  }
  if (sessionStorage.getItem(sessionKey()) === id) clearActiveProfile();
}

export function exportProfile(profile) {
  const payload = {
    format: "starfleet-academy-profile",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: normalizeProfile(profile)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = profile.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  anchor.href = url;
  anchor.download = "starfleet-academy-" + (safeName || "cadet") + ".json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importProfile(file) {
  if (file.size > 1024 * 1024) throw new Error("El archivo de perfil es demasiado grande.");
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || parsed.format !== "starfleet-academy-profile" || !parsed.profile || !parsed.profile.name || !parsed.profile.id) {
    throw new Error("El archivo no contiene un perfil válido de la Academia.");
  }
  const incoming = normalizeProfile(parsed.profile);
  const profiles = getSyncRecords();
  const existing = profiles.findIndex(function(profile) { return profile.id === incoming.id; });
  delete incoming.deletedAt;
  incoming.updatedAt = new Date().toISOString();
  if (existing >= 0) profiles[existing] = incoming;
  else profiles.push(incoming);
  saveProfiles(profiles);
  changed(incoming);
  return incoming;
}
