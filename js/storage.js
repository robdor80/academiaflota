const STORAGE_KEY = "starfleetAcademy.profiles.v1";
const SESSION_KEY = "starfleetAcademy.activeProfile.v1";

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
    studies: { sensores: { completedModules: [] } },
    practices: { sensores: { completed: [], answers: {} } },
    evaluations: { sensores: { attempts: [] } }
  };
}

function normalizeProfile(profile) {
  const p = clone(profile);
  p.schemaVersion = 1;
  p.studies = p.studies || {};
  p.studies.sensores = p.studies.sensores || { completedModules: [] };
  p.studies.sensores.completedModules = p.studies.sensores.completedModules || [];
  p.practices = p.practices || {};
  p.practices.sensores = p.practices.sensores || { completed: [], answers: {} };
  p.practices.sensores.completed = p.practices.sensores.completed || [];
  p.practices.sensores.answers = p.practices.sensores.answers || {};
  p.evaluations = p.evaluations || {};
  p.evaluations.sensores = p.evaluations.sensores || { attempts: [] };
  p.evaluations.sensores.attempts = p.evaluations.sensores.attempts || [];
  return p;
}

export function getProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(normalizeProfile) : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function createProfile(name) {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre del alumno es obligatorio.");
  const profile = emptyProfile(clean);
  const profiles = getProfiles();
  profiles.push(profile);
  saveProfiles(profiles);
  return profile;
}

export function setActiveProfile(id) {
  sessionStorage.setItem(SESSION_KEY, id);
}

export function clearActiveProfile() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getActiveProfile() {
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return getProfiles().find(function(profile) { return profile.id === id; }) || null;
}

export function updateProfile(profile) {
  const profiles = getProfiles();
  const index = profiles.findIndex(function(item) { return item.id === profile.id; });
  if (index < 0) throw new Error("El expediente ya no existe.");
  const normalized = normalizeProfile(profile);
  normalized.updatedAt = new Date().toISOString();
  profiles[index] = normalized;
  saveProfiles(profiles);
  return normalized;
}

export function deleteProfile(id) {
  saveProfiles(getProfiles().filter(function(profile) { return profile.id !== id; }));
  if (sessionStorage.getItem(SESSION_KEY) === id) clearActiveProfile();
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
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || parsed.format !== "starfleet-academy-profile" || !parsed.profile || !parsed.profile.name || !parsed.profile.id) {
    throw new Error("El archivo no contiene un perfil válido de la Academia.");
  }
  const incoming = normalizeProfile(parsed.profile);
  const profiles = getProfiles();
  const existing = profiles.findIndex(function(profile) { return profile.id === incoming.id; });
  if (existing >= 0) profiles[existing] = incoming;
  else profiles.push(incoming);
  saveProfiles(profiles);
  return incoming;
}