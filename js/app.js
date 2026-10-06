import {
  getProfiles, createProfile, setActiveProfile, clearActiveProfile, getActiveProfile,
  updateProfile, deleteProfile, exportProfile, importProfile,
  setStorageOwner, getStorageOwner, onProfileChange
} from "./storage.js";
import { loadStudyData, loadStudyFile, renderLesson, checkUnitReview } from "./study.js?v=0.9.0";
import { loadEvaluationData, renderExam, gradeExam, renderResult } from "./evaluation.js?v=0.5.0";
import { firebaseConfigured } from "./firebase-config.js";
import { createFirebaseClient } from "./firebase-client.js";
import { observeUser, signInWithGoogle, signOutGoogle } from "./firebase-auth.js";
import { createCloudStorage } from "./cloud-storage.js";
import { createSyncManager } from "./sync.js";

const app = {
  profile: null,
  study: null,
  studyCache: {},
  assessmentCache: {},
  accessManual: null,
  curriculum: null,
  exam: null,
  practices: null,
  route: "dashboard",
  currentStudyId: "course-STF-401",
  activeModule: 0,
  activePractice: null
};

const gateway = document.querySelector("#profile-gateway");
const portal = document.querySelector("#academy-portal");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const views = Array.from(document.querySelectorAll("[data-view]"));
const navButtons = Array.from(document.querySelectorAll(".primary-nav [data-route], .desktop-sidebar__nav [data-route]"));
const moduleList = document.querySelector("#module-list");
const lessonContent = document.querySelector("#lesson-content");
const curriculumContainer = document.querySelector("#curriculum-container");
let firebaseClient = null;
let syncManager = null;
let accountUser = null;
let syncState = "loading";
let syncError = "";
let studyRequest = 0;

function renderAccount() {
  const name = accountUser ? (accountUser.displayName || accountUser.email || "Cuenta Google") :
    (firebaseConfigured ? "Sin sesión iniciada" : "Modo local");
  const labels = {
    loading: "Comprobando sesión…",
    unconfigured: "Sincronización en la nube no configurada.",
    signedOut: "Inicie sesión para sincronizar entre dispositivos.",
    syncing: "Sincronizando perfiles…",
    ready: "Sincronización activa.",
    offline: "Sin conexión. Se usa la caché local; se reintentará al volver.",
    error: "Error de sincronización. Los cambios siguen guardados en este dispositivo."
  };
  const status = labels[syncState] + (syncState === "error" && syncError ? " " + syncError : "");
  document.querySelectorAll("[data-account-name]").forEach(function(node) { node.textContent = name; });
  document.querySelectorAll("[data-sync-status]").forEach(function(node) { node.textContent = status; });
  document.querySelectorAll("[data-google-signin]").forEach(function(node) { node.hidden = !firebaseClient || !!accountUser; });
  document.querySelectorAll("[data-google-signout]").forEach(function(node) { node.hidden = !accountUser; });
  document.querySelector("[data-storage-explanation]").textContent = accountUser
    ? "El progreso se guarda en esta cuenta y en la caché de este dispositivo."
    : "El progreso se guarda en este dispositivo hasta que sincronice sus perfiles.";
  document.querySelector("[data-sidebar-sync-status]").textContent = status;
  const candidates = accountUser && syncManager && syncState !== "syncing" ? syncManager.legacyCandidates() : [];
  document.querySelectorAll("[data-migration-notice]").forEach(function(node) { node.hidden = !candidates.length; });
}

function setSyncState(state, error) {
  syncState = state;
  syncError = error?.message || "";
  renderAccount();
}

function refreshFromSync() {
  renderProfileList();
  if (!app.profile) { renderAccount(); return; }
  const current = getProfiles().find(function(profile) { return profile.id === app.profile.id; });
  if (!current) { leaveProfile(); return; }
  app.profile = current;
  refreshProfileUI();
  if (app.route === "subject") renderModule(app.activeModule);
  if (app.route === "practices") renderPractices();
  renderAccount();
}

async function handleAuthUser(user) {
  studyRequest += 1;
  if (syncManager) syncManager.stop();
  app.profile = null;
  portal.hidden = true;
  gateway.hidden = false;
  closeSettings();
  accountUser = user;
  setStorageOwner(user?.uid || null);
  renderProfileList();
  setSyncState(user ? "syncing" : "signedOut");
  if (user) syncManager.start(user.uid);
  const active = getActiveProfile();
  if (active) await enterProfile(active.id);
}

async function startFirebase() {
  if (!firebaseConfigured) {
    renderProfileList();
    setSyncState("unconfigured");
    const active = getActiveProfile();
    if (active) await enterProfile(active.id);
    return;
  }
  try {
    firebaseClient = await createFirebaseClient();
    syncManager = createSyncManager(createCloudStorage(firebaseClient), setSyncState, refreshFromSync);
    onProfileChange(function() { syncManager.schedule(); });
    observeUser(firebaseClient, function(user) { void handleAuthUser(user); }, function(error) {
      setSyncState("error", error);
    });
  } catch (error) {
    firebaseClient = null;
    renderProfileList();
    setSyncState("error", error);
  }
}

function profileStudy() { return app.profile.studies.sensores; }
function profileAccessStudy() { return app.profile.studies.acceso; }
function profilePractices() { return app.profile.practices.sensores; }
function profileEvaluations() { return app.profile.evaluations.sensores; }
function profileCatalogStudy(studyId) {
  app.profile.studies.catalog = app.profile.studies.catalog || {};
  app.profile.studies.catalog[studyId] = app.profile.studies.catalog[studyId] || { completedModules: [] };
  return app.profile.studies.catalog[studyId];
}

function curriculumStudyStats() {
  if (!app.curriculum || !app.profile) return { completed: 0, total: 0, percent: 0 };
  let total = 0;
  let completed = 0;
  app.curriculum.years.forEach(function(year) {
    year.trimesters.forEach(function(term) {
      term.subjects.forEach(function(subject) {
        if (typeof subject !== "object" || !subject.studyId) return;
        total += Number(subject.unitCount || 0);
        completed += (app.profile.studies?.catalog?.[subject.studyId]?.completedModules || []).length;
      });
    });
  });
  return { completed: completed, total: total, percent: total ? Math.round(completed / total * 100) : 0 };
}

function persistProfile() {
  app.profile = updateProfile(app.profile);
  refreshProfileUI();
}

function studyPercent() {
  if (!app.study) return 0;
  return Math.round(profileStudy().completedModules.length / app.study.modules.length * 100);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : value;
  return div.innerHTML;
}

function openSettings() {
  settingsBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSettings() {
  settingsBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function renderProfileList() {
  const profiles = getProfiles();
  const list = document.querySelector("#profile-list");
  const empty = document.querySelector("#empty-profiles");
  list.innerHTML = "";
  empty.hidden = profiles.length > 0;

  profiles.sort(function(a,b) {
    return a.name.localeCompare(b.name, "es");
  }).forEach(function(profile) {
    const sensorModules = profile.studies?.sensores?.completedModules?.length || 0;
    const accessModules = profile.studies?.acceso?.completedModules?.length || 0;
    const catalogModules = Object.values(profile.studies?.catalog || {}).reduce(function(sum,item) {
      return sum + (item?.completedModules?.length || 0);
    }, 0);
    const modules = sensorModules + accessModules + catalogModules;
    const attempts = profile.evaluations?.sensores?.attempts || [];
    const best = attempts.length ? Math.max.apply(null, attempts.map(function(item){ return item.score; })) : null;
    const button = document.createElement("button");
    button.className = "profile-entry";
    button.innerHTML =
      '<span class="profile-entry__avatar">' + escapeHtml(profile.name.trim().charAt(0).toUpperCase()) + "</span>" +
      "<span><strong>" + escapeHtml(profile.name) + "</strong><small>" +
      modules + " unidades estudiadas" + (best === null ? "" : " · mejor test " + best + "%") + "</small></span>" +
      '<span class="profile-entry__arrow">ACCEDER →</span>';
    button.addEventListener("click", function() { enterProfile(profile.id); });
    list.appendChild(button);
  });
}

async function enterProfile(id) {
  const owner = getStorageOwner();
  setActiveProfile(id);
  app.profile = getActiveProfile();
  if (!app.profile) return;
  closeSettings();
  gateway.hidden = true;
  portal.hidden = false;
  await ensureData();
  if (owner !== getStorageOwner() || app.profile?.id !== id) return;
  renderCurriculum();
  refreshProfileUI();
  setRoute("dashboard");
}

function leaveProfile() {
  studyRequest += 1;
  clearActiveProfile();
  app.profile = null;
  portal.hidden = true;
  gateway.hidden = false;
  closeSettings();
  renderProfileList();
  window.scrollTo({top:0});
}

async function ensureData() {
  if (!app.study) app.study = await loadStudyData();

  if (!app.accessManual) {
    const response = await fetch("data/manual-candidato.json?v=0.5.0");
    if (!response.ok) throw new Error("No se pudo cargar el Manual del Candidato.");
    app.accessManual = await response.json();
  }

  if (!app.exam) app.exam = await loadEvaluationData();

  if (!app.curriculum) {
    const response = await fetch("data/curriculum.json?v=0.9.0");
    if (!response.ok) throw new Error("No se pudo cargar el currículo académico.");
    app.curriculum = await response.json();
  }

  if (!app.practices) {
    const response = await fetch("data/practicas-sensores.json?v=0.5.0");
    if (!response.ok) throw new Error("No se pudieron cargar las prácticas.");
    app.practices = await response.json();
  }
}

function setRoute(route) {
  app.route = route;
  views.forEach(function(view) { view.classList.toggle("is-active", view.dataset.view === route); });
  navButtons.forEach(function(button) { button.classList.toggle("is-active", button.dataset.route === route); });
  if (route === "studies") renderCurriculum();
  if (route === "dashboard" || route === "record" || route === "evaluations") refreshProfileUI();
  if (route === "practices") renderPractices();
  window.scrollTo({top:0,behavior:"smooth"});
}

function refreshProfileUI() {
  if (!app.profile || !app.study || !app.practices) return;
  const name = app.profile.name;
  ["#header-cadet-name","#desktop-cadet-name","#welcome-name","#record-name","#footer-cadet-name"].forEach(function(selector) {
    document.querySelector(selector).textContent = name;
  });

  const curriculumStats = curriculumStudyStats();
  document.querySelector("#dashboard-study-progress").textContent = curriculumStats.percent + "%";
  document.querySelector("#dashboard-study-copy").textContent = curriculumStats.completed + " de " + curriculumStats.total + " unidades curriculares estudiadas.";
  document.querySelector("#reader-completion").textContent = "PROGRESO " + currentStudyPercent() + "%";

  const practiced = profilePractices().completed.length;
  document.querySelector("#dashboard-practice-progress").textContent = practiced + "/" + app.practices.items.length;

  const attempts = profileEvaluations().attempts;
  const best = attempts.length ? Math.max.apply(null, attempts.map(function(a) { return a.score; })) : null;
  document.querySelector("#dashboard-best-score").textContent = best === null ? "—" : best + "%";
  document.querySelector("#dashboard-attempts-copy").textContent = attempts.length
    ? attempts.length + " intento" + (attempts.length === 1 ? "" : "s") + " registrado" + (attempts.length === 1 ? "" : "s") + "."
    : "Sin intentos registrados.";
  document.querySelector("#evaluation-history-summary").textContent = attempts.length
    ? attempts.length + " intento" + (attempts.length === 1 ? "" : "s") + " · mejor resultado: " + best + "%"
    : "Sin intentos previos.";

  renderRecord();
  if (moduleList.children.length) syncModuleButtons();
}

function subjectHtml(subject) {
  if (typeof subject === "string") {
    return '<div class="subject-item"><span>' + escapeHtml(subject) + '</span></div>';
  }

  const meta = subject.specialization ? '<small class="subject-item__meta">' + escapeHtml(subject.specialization) + '</small>' : "";
  if (subject.available && subject.studyId) {
    const method = '<small class="subject-item__method">Teoría · Clase con instructor · Práctica · Evaluación continua</small>';
    return '<button class="subject-item subject-item--available" data-open-study="' + subject.studyId + '">' +
      '<span><strong>' + escapeHtml(subject.title) + '</strong>' + meta + method + '</span>' +
      '<span class="subject-item__action">ABRIR MATERIAL →</span></button>';
  }

  return '<div class="subject-item"><span>' + escapeHtml(subject.title || "") + meta + '</span></div>';
}

function renderTerm(term) {
  return '<article class="term-card">' +
    '<header class="term-card__head"><span>' + escapeHtml(term.title) + '</span><h3>' +
    escapeHtml(term.subtitle) + '</h3><p>' + escapeHtml(term.objective) + '</p></header>' +
    '<div class="subject-list">' + term.subjects.map(subjectHtml).join("") + '</div></article>';
}

function renderCurriculum() {
  if (!app.curriculum || !curriculumContainer) return;

  const pre = app.curriculum.preAcademia;
  const accessMaterials = (pre.materials || []).map(function(item) {
    return '<button class="access-manual-card" data-open-study="' + item.studyId + '">' +
      '<span class="access-manual-card__icon">A</span>' +
      '<span class="access-manual-card__body"><small>MANUAL OFICIAL DE ACCESO · v' + escapeHtml(item.version) + '</small>' +
      '<strong>' + escapeHtml(item.title) + '</strong><em>' + escapeHtml(item.subtitle) + '</em></span>' +
      '<span class="access-manual-card__action">ESTUDIAR →</span></button>';
  }).join("");

  let html =
    '<section class="curriculum-section curriculum-section--access">' +
      '<header class="curriculum-section__header"><div><h2>' + escapeHtml(pre.title) + '</h2></div></header>' +
      '<div class="curriculum-section__body">' + accessMaterials + '</div></section>';

  app.curriculum.years.forEach(function(year, yearIndex) {
    const specializationText = year.specializations
      ? '<div class="specialization-note"><strong>Ramas de especialización:</strong> ' +
        year.specializations.map(escapeHtml).join(" · ") +
        '. La web no bloquea ninguna rama ni ningún trimestre.</div>'
      : "";

    const supplementary = year.supplementary
      ? '<div class="supplementary"><h3>Material complementario</h3><div class="supplementary-grid">' +
        year.supplementary.map(function(item) {
          return '<button data-open-study="' + item.studyId + '"><strong>' + escapeHtml(item.title) +
            '</strong><small>Material académico complementario</small></button>';
        }).join("") + '</div></div>'
      : "";

    html +=
      '<section class="curriculum-section curriculum-section--year-' + (yearIndex + 1) + '">' +
        '<header class="curriculum-section__header"><div><span class="overline">' + escapeHtml(year.year) +
        '</span><h2>' + escapeHtml(year.title) + '</h2></div></header>' +
        '<div class="curriculum-section__body">' + specializationText +
          '<div class="term-grid">' + year.trimesters.map(renderTerm).join("") + '</div>' +
          supplementary +
        '</div></section>';
  });

  if (app.curriculum.branchLibrary?.length) {
    html += '<section class="curriculum-section"><header class="curriculum-section__header"><div>' +
      '<span class="overline">BIBLIOTECA PROFESIONAL</span><h2>Ramas de especialización</h2>' +
      '<p>Manuales completos de rama para 2.ª y 1.ª clase. Consultables sin bloquear el perfil.</p></div></header>' +
      '<div class="curriculum-section__body"><div class="supplementary-grid">' +
      app.curriculum.branchLibrary.map(function(item) {
        return '<button data-open-study="' + item.studyId + '"><strong>' + escapeHtml(item.title) +
          '</strong><small>' + item.unitCount + ' unidades profesionales · 2.ª y 1.ª clase</small></button>';
      }).join("") + '</div></div></section>';
  }

  if (app.curriculum.legacySupplementary?.length) {
    html += '<section class="curriculum-section"><header class="curriculum-section__header"><div>' +
      '<span class="overline">MANUAL OPERACIONAL EXISTENTE</span><h2>Operaciones de Sensores v0.1</h2>' +
      '<p>Material especializado previo, conservado como consulta complementaria.</p></div></header>' +
      '<div class="curriculum-section__body"><div class="supplementary-grid">' +
      app.curriculum.legacySupplementary.map(function(item) {
        return '<button data-open-study="' + item.studyId + '"><strong>' + escapeHtml(item.title) +
          '</strong><small>Manual especializado de Sensores</small></button>';
      }).join("") + '</div></div></section>';
  }

  curriculumContainer.innerHTML = html;
}

function findStudyDefinition(studyId) {
  if (!app.curriculum) return null;

  if (studyId === "manual-candidato" && app.accessManual) {
    return {
      id: "manual-candidato",
      title: "Manual del Candidato",
      code: "PREPARACIÓN PARA EL ACCESO",
      subtitle: "Orientación general para el acceso · v" + app.accessManual.version,
      units: app.accessManual.modules.map(function(module) { return module.id; }),
      source: "acceso",
      label: "MANUAL DEL CANDIDATO"
    };
  }

  for (const year of app.curriculum.years) {
    for (const term of year.trimesters) {
      for (const subject of term.subjects) {
        if (typeof subject === "object" && subject.studyId === studyId) {
          return {
            id: subject.studyId,
            title: subject.title,
            code: subject.courseId || "ACADEMIA",
            subtitle: year.title + " · " + term.title + " · " + term.subtitle,
            units: null,
            source: subject.source || "course",
            dataFile: subject.dataFile || null,
            assessmentFile: subject.assessmentFile || null,
            label: subject.courseId || "MATERIAL ACADÉMICO"
          };
        }
      }
    }

    for (const item of year.supplementary || []) {
      if (item.studyId === studyId) {
        return {
          id: item.studyId,
          title: item.title,
          code: "SENSORES · CONSULTA",
          subtitle: "Material complementario del Manual de Sensores",
          units: item.units,
          source: "sensores",
          label: "OPERACIONES DE SENSORES"
        };
      }
    }
  }

  for (const item of app.curriculum.branchLibrary || []) {
    if (item.studyId === studyId) {
      return {
        id: item.studyId,
        title: item.title,
        code: "RAMA PROFESIONAL",
        subtitle: "2.ª y 1.ª clase · Currículo de especialización",
        units: null,
        source: "branch",
        dataFile: item.dataFile,
        assessmentFile: item.assessmentFile || null,
        label: item.title.toUpperCase()
      };
    }
  }

  for (const item of app.curriculum.legacySupplementary || []) {
    if (item.studyId === studyId) {
      return {
        id: item.studyId,
        title: item.title,
        code: "SENSORES · CONSULTA",
        subtitle: "Manual especializado de Operaciones de Sensores v0.1",
        units: item.units,
        source: "sensores",
        label: "OPERACIONES DE SENSORES"
      };
    }
  }

  return null;
}

function currentModules() {
  const definition = findStudyDefinition(app.currentStudyId);
  if (!definition) return [];
  if (definition.source === "acceso") {
    return definition.units.map(function(id) {
      return app.accessManual.modules.find(function(module) { return module.id === id; });
    }).filter(Boolean);
  }
  if (definition.source === "sensores") {
    return definition.units.map(function(id) {
      return app.study.modules.find(function(module) { return module.id === id; });
    }).filter(Boolean);
  }
  return app.studyCache[app.currentStudyId]?.modules || [];
}

function currentStudyProgress() {
  const definition = findStudyDefinition(app.currentStudyId);
  if (definition?.source === "acceso") return profileAccessStudy();
  if (definition?.source === "sensores") return profileStudy();
  return profileCatalogStudy(app.currentStudyId);
}

function currentStudyPercent() {
  const modules = currentModules();
  if (!modules.length) return 0;
  const completed = currentStudyProgress().completedModules;
  const done = modules.filter(function(module) { return completed.includes(module.id); }).length;
  return Math.round(done / modules.length * 100);
}

async function openStudy(studyId) {
  const definition = findStudyDefinition(studyId);
  if (!definition) return;
  const request = ++studyRequest;
  const profileId = app.profile?.id;
  const owner = getStorageOwner();
  if ((definition.source === "course" || definition.source === "branch") && !app.studyCache[studyId]) {
    app.studyCache[studyId] = await loadStudyFile(definition.dataFile);
  }
  if ((definition.source === "course" || definition.source === "branch") && definition.assessmentFile && !app.assessmentCache[studyId]) {
    app.assessmentCache[studyId] = await loadStudyFile(definition.assessmentFile);
  }
  if (request !== studyRequest || app.profile?.id !== profileId || owner !== getStorageOwner()) return;
  app.currentStudyId = studyId;
  app.activeModule = 0;
  document.querySelector("#subject-code").textContent = definition.code;
  document.querySelector("#subject-title").textContent = definition.title;
  document.querySelector("#subject-subtitle").textContent = definition.subtitle;
  renderModuleList();
  renderModule(0);
  setRoute("subject");
}

function renderModuleList() {
  const modules = currentModules();
  moduleList.innerHTML = "";
  modules.forEach(function(module,index) {
    const button = document.createElement("button");
    button.className = "module-btn";
    button.innerHTML =
      '<span class="module-btn__num">' + module.id + "</span>" +
      '<span class="module-btn__title">' + module.title + "</span>" +
      '<span class="module-btn__done"></span>';
    button.addEventListener("click", function() { renderModule(index); });
    moduleList.appendChild(button);
  });
  syncModuleButtons();
}

function renderModule(index) {
  const modules = currentModules();
  if (!modules.length) return;
  app.activeModule = Math.max(0,Math.min(index,modules.length-1));
  const module = modules[app.activeModule];
  const definition = findStudyDefinition(app.currentStudyId);
  lessonContent.innerHTML = renderLesson(module, { label: definition?.label || "MATERIAL DE ESTUDIO", assessment: app.assessmentCache[app.currentStudyId] || null });
  document.querySelector("#reader-position").textContent =
    module.id + " · " + (app.activeModule + 1) + " de " + modules.length;
  document.querySelector("#reader-completion").textContent = "PROGRESO " + currentStudyPercent() + "%";
  document.querySelector("#prev-module").disabled = app.activeModule === 0;
  document.querySelector("#next-module").disabled = app.activeModule === modules.length - 1;
  document.querySelector("#mark-complete").textContent =
    currentStudyProgress().completedModules.includes(module.id) ? "✓ Unidad estudiada" : "Marcar como estudiado";
  syncModuleButtons();
}

function syncModuleButtons() {
  const modules = currentModules();
  Array.from(moduleList.querySelectorAll(".module-btn")).forEach(function(button,index) {
    const id = modules[index].id;
    const done = currentStudyProgress().completedModules.includes(id);
    button.classList.toggle("is-active",index === app.activeModule);
    button.classList.toggle("is-complete",done);
    button.querySelector(".module-btn__done").textContent = done ? "✓" : "";
  });
}

function toggleModuleComplete() {
  const modules = currentModules();
  if (!modules.length) return;
  const id = modules[app.activeModule].id;
  const completed = currentStudyProgress().completedModules;
  const index = completed.indexOf(id);
  if (index >= 0) completed.splice(index,1);
  else completed.push(id);
  completed.sort();
  persistProfile();
  renderModule(app.activeModule);
}

function renderPractices() {
  const container = document.querySelector("#practice-list");
  container.innerHTML = app.practices.items.map(function(item) {
    const done = profilePractices().completed.includes(item.id);
    return '<article class="practice-card ' + (done ? "is-complete" : "") + '">' +
      '<span class="overline">' + item.id + " · OPERACIONES DE SENSORES</span>" +
      "<h2>" + item.title + "</h2><p>" + item.scenario + "</p>" +
      '<div class="practice-card__footer"><span class="practice-card__status">' +
      (done ? "✓ Revisada" : "Pendiente") + '</span><button class="button button--secondary" data-practice-id="' +
      item.id + '">Abrir práctica</button></div></article>';
  }).join("");
}

function openPractice(id) {
  const item = app.practices.items.find(function(p) { return p.id === id; });
  if (!item) return;
  app.activePractice = id;
  const answer = profilePractices().answers[id] || "";
  const done = profilePractices().completed.includes(id);

  document.querySelector("#practice-detail").innerHTML =
    '<span class="overline">' + item.id + " · PRÁCTICA DE ESTUDIO</span>" +
    "<h1>" + item.title + '</h1><div class="practice-scenario">' + item.scenario + "</div>" +
    '<label for="practice-answer">Plan de actuación</label>' +
    '<textarea id="practice-answer" placeholder="Describe cómo configurarías la consola, qué comprobarías y cómo informarías el resultado...">' +
    escapeHtml(answer) + '</textarea><div class="practice-actions">' +
    '<button id="save-practice-answer" class="button button--primary">Guardar respuesta</button>' +
    '<button id="show-practice-criteria" class="button button--secondary">Mostrar criterios</button>' +
    '<button id="complete-practice" class="button button--secondary">' +
    (done ? "✓ Práctica revisada" : "Marcar como revisada") + '</button></div>' +
    '<section id="practice-criteria" class="criteria" hidden><span class="overline">CRITERIOS DEL MANUAL</span>' +
    "<h3>Qué se evalúa</h3><p>" + item.evaluation + "</p></section>";
  setRoute("practice");
}

function savePracticeAnswer() {
  profilePractices().answers[app.activePractice] = document.querySelector("#practice-answer").value.trim();
  persistProfile();
  alert("Respuesta guardada en el perfil local.");
}

function togglePracticeComplete() {
  const completed = profilePractices().completed;
  const id = app.activePractice;
  const index = completed.indexOf(id);
  if (index >= 0) completed.splice(index,1);
  else completed.push(id);
  persistProfile();
  openPractice(id);
}

function startEvaluation() {
  document.querySelector("#evaluation-container").innerHTML = renderExam(app.exam);
  setRoute("evaluation");
}

function submitEvaluation(form) {
  const data = new FormData(form);
  if (app.exam.questions.some(function(q) { return !data.has(q.id); })) {
    alert("Debe responder todas las preguntas antes de entregar el test.");
    return;
  }

  const result = gradeExam(app.exam,data);
  profileEvaluations().attempts.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: new Date().toISOString(),
    score: result.score,
    passed: result.passed,
    correct: result.correct,
    total: result.total
  });
  persistProfile();
  document.querySelector("#evaluation-container").innerHTML = renderResult(result);
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderRecord() {
  if (!app.profile || !app.study || !app.practices) return;
  const stats = curriculumStudyStats();
  const modules = stats.completed;
  const practices = profilePractices().completed.length;
  const attempts = profileEvaluations().attempts;
  const best = attempts.length ? Math.max.apply(null, attempts.map(function(a) { return a.score; })) : null;
  const last = attempts.length ? attempts[attempts.length - 1] : null;

  document.querySelector("#record-summary").innerHTML =
    '<article class="record-item"><span>CURRÍCULO · ESTUDIO</span><strong>' + modules + "/" + stats.total +
    '</strong><p>Unidades curriculares marcadas como estudiadas.</p></article>' +
    '<article class="record-item"><span>PRÁCTICAS</span><strong>' + practices + "/" + app.practices.items.length +
    '</strong><p>Ejercicios revisados.</p></article>' +
    '<article class="record-item"><span>MEJOR TEST</span><strong>' + (best === null ? "—" : best + "%") + "</strong><p>" +
    (last ? "Último intento: " + new Date(last.date).toLocaleDateString("es-ES") : "Sin tests realizados.") +
    "</p></article>";
}

document.addEventListener("click", function(event) {
  if (event.target.closest("[data-open-settings]")) openSettings();
  if (event.target.closest("[data-switch-profile]")) leaveProfile();

  const routeElement = event.target.closest("[data-route]");
  if (routeElement && app.profile) setRoute(routeElement.dataset.route);

  const studyElement = event.target.closest("[data-open-study]");
  if (studyElement && app.profile) {
    openStudy(studyElement.dataset.openStudy).catch(function(error) { alert(error.message); });
  }

  const practiceElement = event.target.closest("[data-practice-id]");
  if (practiceElement) openPractice(practiceElement.dataset.practiceId);

  if (event.target.id === "show-practice-criteria") document.querySelector("#practice-criteria").hidden = false;
  if (event.target.id === "save-practice-answer") savePracticeAnswer();
  if (event.target.id === "complete-practice") togglePracticeComplete();

  const checkReview = event.target.closest("[data-check-unit-review]");
  if (checkReview) checkUnitReview(document.querySelector("#unit-review-" + checkReview.dataset.checkUnitReview));

  const newReview = event.target.closest("[data-new-unit-review]");
  if (newReview) renderModule(app.activeModule);
});

document.addEventListener("click", async function(event) {
  if (event.target.closest("[data-google-signin]")) {
    try { await signInWithGoogle(firebaseClient); }
    catch (error) { if (error.code !== "auth/popup-closed-by-user") setSyncState("error", error); }
  }
  if (event.target.closest("[data-google-signout]")) {
    try { await signOutGoogle(firebaseClient); }
    catch (error) { setSyncState("error", error); }
  }
  if (event.target.closest("[data-migrate-profiles]")) {
    const count = syncManager.migrateLegacy();
    if (count) setSyncState("syncing");
  }
});

document.querySelector("#close-settings").addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", function(event) {
  if (event.target === settingsBackdrop) closeSettings();
});
document.addEventListener("keydown", function(event) {
  if (event.key === "Escape" && !settingsBackdrop.hidden) closeSettings();
});

document.querySelector("#create-profile-form").addEventListener("submit", function(event) {
  event.preventDefault();
  try {
    const profile = createProfile(document.querySelector("#profile-name").value);
    event.target.reset();
    renderProfileList();
    enterProfile(profile.id);
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#import-profile").addEventListener("change", async function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const profile = await importProfile(file);
    renderProfileList();
    await enterProfile(profile.id);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#switch-profile").addEventListener("click", leaveProfile);

function moveModule(delta) {
  renderModule(app.activeModule + delta);
  requestAnimationFrame(function() {
    lessonContent.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

document.querySelector("#prev-module").addEventListener("click", function() { moveModule(-1); });
document.querySelector("#next-module").addEventListener("click", function() { moveModule(1); });
document.querySelector("#mark-complete").addEventListener("click", toggleModuleComplete);
document.querySelector("#start-evaluation").addEventListener("click", startEvaluation);

document.addEventListener("submit", function(event) {
  if (event.target.id === "exam-form") {
    event.preventDefault();
    submitEvaluation(event.target);
  }
});

document.querySelector("#export-profile").addEventListener("click", function() { exportProfile(app.profile); });
document.querySelector("#delete-profile").addEventListener("click", function() {
  if (!confirm("¿Eliminar el perfil " + app.profile.name + "? Si hay sesión iniciada, el borrado se sincronizará con la cuenta. Esta acción no puede deshacerse salvo que exista una copia JSON exportada.")) return;
  deleteProfile(app.profile.id);
  leaveProfile();
});

renderAccount();
void startFirebase();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(function(error) {
      console.warn("No se pudo registrar el service worker:", error);
    });
  });
}
