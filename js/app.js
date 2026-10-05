const state = {
  data: null,
  activeRoute: "home",
  activeModule: 0,
  completed: new Set(JSON.parse(localStorage.getItem("academy.sensor.completed") || "[]"))
};

const views = [...document.querySelectorAll("[data-view]")];
const routeButtons = [...document.querySelectorAll("[data-route]")];
const moduleList = document.querySelector("#module-list");
const lessonContent = document.querySelector("#lesson-content");
const prevButton = document.querySelector("#prev-module");
const nextButton = document.querySelector("#next-module");
const completeButton = document.querySelector("#mark-complete");

function setRoute(route) {
  state.activeRoute = route;
  views.forEach(view => view.classList.toggle("is-active", view.dataset.view === route));
  routeButtons.forEach(btn => btn.classList.toggle("is-active", btn.dataset.route === route));
  document.querySelector("#app")?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (route === "progress") renderProgress();
}

function setStardate() {
  const now = new Date();
  const stamp = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(now).toUpperCase();
  document.querySelector("#stardate").textContent = `FECHA TERRESTRE // ${stamp}`;
}

async function loadSensorData() {
  const response = await fetch("data/sensores.json");
  if (!response.ok) throw new Error("No se pudo cargar el temario de Sensores.");
  state.data = await response.json();
  renderModuleList();
  renderModule(0);
  updateProgressUI();
}

function renderModuleList() {
  moduleList.innerHTML = "";
  state.data.modules.forEach((module, index) => {
    const button = document.createElement("button");
    button.className = "module-btn";
    button.dataset.index = index;
    button.innerHTML = `
      <span class="module-btn__num">${module.id}</span>
      <span class="module-btn__title">${module.title}</span>
      <span class="module-btn__done">${state.completed.has(module.id) ? "✓" : ""}</span>
    `;
    button.addEventListener("click", () => renderModule(index));
    moduleList.appendChild(button);
  });
  syncModuleButtons();
}

function renderBlock(block) {
  if (block.type === "p") return `<p>${block.text}</p>`;
  if (block.type === "bullets") {
    return `<ul>${block.items.map(item => `<li>${item}</li>`).join("")}</ul>`;
  }
  if (block.type === "callout") {
    return `<div class="callout"><strong>${block.label}</strong><p>${block.text}</p></div>`;
  }
  if (block.type === "procedure") {
    return `<section class="procedure"><h3>${block.title}</h3><ol>${block.steps.map(step => `<li>${step}</li>`).join("")}</ol></section>`;
  }
  if (block.type === "table") {
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${block.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  return "";
}

function renderModule(index) {
  if (!state.data) return;
  state.activeModule = Math.max(0, Math.min(index, state.data.modules.length - 1));
  const module = state.data.modules[state.activeModule];

  lessonContent.innerHTML = `
    <span class="lesson-kicker">SENSOR OPERATIONS // MÓDULO ${module.id}</span>
    <h1>${module.title}</h1>
    <p class="lesson-subtitle">${module.subtitle}</p>
    ${module.blocks.map(renderBlock).join("")}
  `;

  document.querySelector("#reader-position").textContent =
    `MÓDULO ${module.id} / ${state.data.modules.at(-1).id}`;

  prevButton.disabled = state.activeModule === 0;
  nextButton.disabled = state.activeModule === state.data.modules.length - 1;
  completeButton.textContent = state.completed.has(module.id)
    ? "✓ MÓDULO ESTUDIADO"
    : "MARCAR COMO ESTUDIADO";

  syncModuleButtons();
  lessonContent.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncModuleButtons() {
  document.querySelectorAll(".module-btn").forEach((button, index) => {
    const id = state.data.modules[index].id;
    button.classList.toggle("is-active", index === state.activeModule);
    button.classList.toggle("is-complete", state.completed.has(id));
    button.querySelector(".module-btn__done").textContent = state.completed.has(id) ? "✓" : "";
  });
}

function toggleComplete() {
  const module = state.data.modules[state.activeModule];
  if (state.completed.has(module.id)) state.completed.delete(module.id);
  else state.completed.add(module.id);
  localStorage.setItem("academy.sensor.completed", JSON.stringify([...state.completed]));
  renderModule(state.activeModule);
  updateProgressUI();
}

function progressPercent() {
  if (!state.data?.modules?.length) return 0;
  return Math.round((state.completed.size / state.data.modules.length) * 100);
}

function updateProgressUI() {
  const percent = progressPercent();
  document.querySelector("#sensor-progress-bar").style.width = `${percent}%`;
  document.querySelector("#sensor-progress-label").textContent = `${percent} % COMPLETADO`;
  document.querySelector("#reader-completion").textContent = `PROGRESO ${percent} %`;
  renderProgress();
}

function renderProgress() {
  if (!state.data) return;
  const percent = progressPercent();
  document.querySelector("#progress-big").textContent = `${percent}%`;
  document.querySelector("#progress-ring").style.setProperty("--progress", `${percent * 3.6}deg`);
  const done = state.completed.size;
  const total = state.data.modules.length;
  document.querySelector("#progress-copy").textContent =
    done === 0
      ? "Aún no has marcado ningún módulo como estudiado."
      : `Has completado ${done} de ${total} módulos del Manual de Operador de Sensores.`;
}

document.addEventListener("click", event => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) setRoute(routeTarget.dataset.route);

  const subjectTarget = event.target.closest("[data-open-subject]");
  if (subjectTarget?.dataset.openSubject === "sensores") {
    setRoute("subject");
    renderModule(state.activeModule);
  }
});

prevButton.addEventListener("click", () => renderModule(state.activeModule - 1));
nextButton.addEventListener("click", () => renderModule(state.activeModule + 1));
completeButton.addEventListener("click", toggleComplete);

document.querySelector("#reset-progress").addEventListener("click", () => {
  if (!confirm("¿Reiniciar el progreso local del manual de Sensores?")) return;
  state.completed.clear();
  localStorage.removeItem("academy.sensor.completed");
  renderModuleList();
  renderModule(state.activeModule);
  updateProgressUI();
});

setStardate();
loadSensorData().catch(error => {
  console.error(error);
  lessonContent.innerHTML = `<div class="callout"><strong>ERROR DE DATOS</strong><p>${error.message}</p></div>`;
});
