import {
  getProfiles, createProfile, setActiveProfile, clearActiveProfile, getActiveProfile,
  updateProfile, deleteProfile, exportProfile, importProfile
} from "./storage.js?v=0.3.0";
import { loadStudyData, renderLesson } from "./study.js?v=0.3.0";
import { loadEvaluationData, renderExam, gradeExam, renderResult } from "./evaluation.js?v=0.3.0";

const app = {
  profile: null,
  study: null,
  curriculum: null,
  exam: null,
  practices: null,
  route: "dashboard",
  currentStudyId: "sensores-i",
  activeModule: 0,
  activePractice: null
};

const gateway = document.querySelector("#profile-gateway");
const portal = document.querySelector("#academy-portal");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const views = Array.from(document.querySelectorAll("[data-view]"));
const navButtons = Array.from(document.querySelectorAll(".primary-nav [data-route]"));
const moduleList = document.querySelector("#module-list");
const lessonContent = document.querySelector("#lesson-content");
const curriculumContainer = document.querySelector("#curriculum-container");

function profileStudy() { return app.profile.studies.sensores; }
function profilePractices() { return app.profile.practices.sensores; }
function profileEvaluations() { return app.profile.evaluations.sensores; }

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
    const modules = profile.studies?.sensores?.completedModules?.length || 0;
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
  setActiveProfile(id);
  app.profile = getActiveProfile();
  if (!app.profile) return;
  closeSettings();
  gateway.hidden = true;
  portal.hidden = false;
  await ensureData();
  renderCurriculum();
  refreshProfileUI();
  setRoute("dashboard");
}

function leaveProfile() {
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
  if (!app.exam) app.exam = await loadEvaluationData();

  if (!app.curriculum) {
    const response = await fetch("data/curriculum.json?v=0.3.0");
    if (!response.ok) throw new Error("No se pudo cargar el currículo académico.");
    app.curriculum = await response.json();
  }

  if (!app.practices) {
    const response = await fetch("data/practicas-sensores.json?v=0.3.0");
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
  ["#header-cadet-name","#welcome-name","#record-name","#footer-cadet-name"].forEach(function(selector) {
    document.querySelector(selector).textContent = name;
  });

  const completed = profileStudy().completedModules.length;
  const total = app.study.modules.length;
  const percent = studyPercent();
  document.querySelector("#dashboard-study-progress").textContent = percent + "%";
  document.querySelector("#dashboard-study-copy").textContent = completed + " de " + total + " unidades estudiadas.";
  document.querySelector("#reader-completion").textContent = "PROGRESO " + percent + "%";

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
  let html =
    '<section class="curriculum-section">' +
      '<header class="curriculum-section__header"><div><span class="overline">ANTES DE LA ACADEMIA</span><h2>' +
      escapeHtml(pre.title) + '</h2><p>' + escapeHtml(pre.subtitle) + '</p></div><span class="badge">OPCIONAL</span></header>' +
      '<div class="curriculum-section__body"><ul class="preacademy-list">' +
      pre.subjects.map(function(item){ return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      '</ul></div></section>';

  app.curriculum.years.forEach(function(year) {
    const specializationText = year.specializations
      ? '<div class="specialization-note"><strong>Ramas de especialización:</strong> ' +
        year.specializations.map(escapeHtml).join(" · ") +
        '. La web no bloquea ninguna rama ni ningún trimestre.</div>'
      : "";

    const supplementary = year.supplementary
      ? '<div class="supplementary"><h3>Material complementario de Sensores</h3><div class="supplementary-grid">' +
        year.supplementary.map(function(item) {
          return '<button data-open-study="' + item.studyId + '"><strong>' + escapeHtml(item.title) +
            '</strong><small>Consulta transversal del Manual de Sensores</small></button>';
        }).join("") + '</div></div>'
      : "";

    html +=
      '<section class="curriculum-section">' +
        '<header class="curriculum-section__header"><div><span class="overline">' + escapeHtml(year.year) +
        '</span><h2>' + escapeHtml(year.title) + '</h2></div></header>' +
        '<div class="curriculum-section__body">' + specializationText +
          '<div class="term-grid">' + year.trimesters.map(renderTerm).join("") + '</div>' +
          supplementary +
        '</div></section>';
  });

  curriculumContainer.innerHTML = html;
}

function findStudyDefinition(studyId) {
  if (!app.curriculum) return null;

  for (const year of app.curriculum.years) {
    for (const term of year.trimesters) {
      for (const subject of term.subjects) {
        if (typeof subject === "object" && subject.studyId === studyId) {
          return {
            id: subject.studyId,
            title: subject.title,
            code: "CIENCIAS / SENSORES",
            subtitle: year.title + " · " + term.title,
            units: subject.units
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
          units: item.units
        };
      }
    }
  }

  return null;
}

function currentModules() {
  const definition = findStudyDefinition(app.currentStudyId);
  if (!definition) return [];
  return definition.units
    .map(function(id) { return app.study.modules.find(function(module) { return module.id === id; }); })
    .filter(Boolean);
}

function openStudy(studyId) {
  const definition = findStudyDefinition(studyId);
  if (!definition) return;
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
  lessonContent.innerHTML = renderLesson(module);
  document.querySelector("#reader-position").textContent =
    "UNIDAD " + module.id + " · " + (app.activeModule + 1) + " de " + modules.length;
  document.querySelector("#prev-module").disabled = app.activeModule === 0;
  document.querySelector("#next-module").disabled = app.activeModule === modules.length - 1;
  document.querySelector("#mark-complete").textContent =
    profileStudy().completedModules.includes(module.id) ? "✓ Unidad estudiada" : "Marcar como estudiado";
  syncModuleButtons();
}

function syncModuleButtons() {
  const modules = currentModules();
  Array.from(moduleList.querySelectorAll(".module-btn")).forEach(function(button,index) {
    const id = modules[index].id;
    const done = profileStudy().completedModules.includes(id);
    button.classList.toggle("is-active",index === app.activeModule);
    button.classList.toggle("is-complete",done);
    button.querySelector(".module-btn__done").textContent = done ? "✓" : "";
  });
}

function toggleModuleComplete() {
  const modules = currentModules();
  if (!modules.length) return;
  const id = modules[app.activeModule].id;
  const completed = profileStudy().completedModules;
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
  const modules = profileStudy().completedModules.length;
  const practices = profilePractices().completed.length;
  const attempts = profileEvaluations().attempts;
  const best = attempts.length ? Math.max.apply(null, attempts.map(function(a) { return a.score; })) : null;
  const last = attempts.length ? attempts[attempts.length - 1] : null;

  document.querySelector("#record-summary").innerHTML =
    '<article class="record-item"><span>SENSORES · ESTUDIO</span><strong>' + modules + "/" + app.study.modules.length +
    '</strong><p>Unidades marcadas como estudiadas.</p></article>' +
    '<article class="record-item"><span>PRÁCTICAS</span><strong>' + practices + "/" + app.practices.items.length +
    '</strong><p>Ejercicios revisados.</p></article>' +
    '<article class="record-item"><span>MEJOR TEST</span><strong>' + (best === null ? "—" : best + "%") + "</strong><p>" +
    (last ? "Último intento: " + new Date(last.date).toLocaleDateString("es-ES") : "Sin tests realizados.") +
    "</p></article>";
}

document.addEventListener("click", function(event) {
  if (event.target.closest("[data-open-settings]")) openSettings();

  const routeElement = event.target.closest("[data-route]");
  if (routeElement && app.profile) setRoute(routeElement.dataset.route);

  const studyElement = event.target.closest("[data-open-study]");
  if (studyElement && app.profile) openStudy(studyElement.dataset.openStudy);

  const practiceElement = event.target.closest("[data-practice-id]");
  if (practiceElement) openPractice(practiceElement.dataset.practiceId);

  if (event.target.id === "show-practice-criteria") document.querySelector("#practice-criteria").hidden = false;
  if (event.target.id === "save-practice-answer") savePracticeAnswer();
  if (event.target.id === "complete-practice") togglePracticeComplete();
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
document.querySelector("#prev-module").addEventListener("click", function() { renderModule(app.activeModule-1); });
document.querySelector("#next-module").addEventListener("click", function() { renderModule(app.activeModule+1); });
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
  if (!confirm("¿Eliminar definitivamente el perfil local de " + app.profile.name + "? Esta acción no puede deshacerse salvo que exista una copia JSON exportada.")) return;
  deleteProfile(app.profile.id);
  leaveProfile();
});

renderProfileList();
const active = getActiveProfile();
if (active) enterProfile(active.id);
