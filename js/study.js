export async function loadStudyFile(path) {
  if (!path) throw new Error("El material de estudio no tiene un archivo asociado.");
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(path + separator + "v=0.7.3");
  if (!response.ok) throw new Error("No se pudo cargar el material académico.");
  return response.json();
}

export async function loadStudyData() {
  return loadStudyFile("data/sensores.json");
}

function escapeHtml(value) {
  const text = value == null ? "" : String(value);
  return text.replace(/[&<>"']/g, function(char) {
    return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char];
  });
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function normalizeAnswer(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function richText(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function blockHtml(block) {
  if (block.type === "p") return "<p>" + richText(block.text) + "</p>";
  if (block.type === "quote") return '<blockquote class="lesson-quote">' + richText(block.text) + "</blockquote>";
  if (block.type === "heading") return '<h2 class="lesson-section-title">' + richText(block.text) + "</h2>";
  if (block.type === "definition") return '<div class="definition-block"><strong>' + escapeHtml(block.term) + '</strong><p>' + richText(block.text) + "</p></div>";
  if (block.type === "bullets") return "<ul>" + block.items.map(function(item) { return "<li>" + richText(item) + "</li>"; }).join("") + "</ul>";
  if (block.type === "numbered") return "<ol>" + block.items.map(function(item) { return "<li>" + richText(item) + "</li>"; }).join("") + "</ol>";
  if (block.type === "callout") return '<div class="callout"><strong>' + escapeHtml(block.label) + "</strong><p>" + richText(block.text) + "</p></div>";
  if (block.type === "procedure") {
    return '<section class="procedure"><h3>' + block.title + "</h3><ol>" +
      block.steps.map(function(step) { return "<li>" + step + "</li>"; }).join("") + "</ol></section>";
  }
  if (block.type === "table") {
    return '<div class="data-table-wrap"><table class="data-table"><thead><tr>' +
      block.headers.map(function(h) { return "<th>" + richText(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      block.rows.map(function(row) {
        return "<tr>" + row.map(function(cell) { return "<td>" + richText(cell) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
  }
  return "";
}

function multipleChoiceOptions(concept, unitConcepts, allConcepts) {
  const correct = concept.answer_display_es;
  const local = unitConcepts
    .filter(function(item) { return item.id !== concept.id && item.answer_display_es && item.answer_display_es !== correct; })
    .map(function(item) { return item.answer_display_es; });
  const global = allConcepts
    .filter(function(item) { return item.unit_id !== concept.unit_id && item.answer_display_es && item.answer_display_es !== correct; })
    .map(function(item) { return item.answer_display_es; });
  const unique = [];
  local.concat(global).forEach(function(item) { if (!unique.includes(item)) unique.push(item); });
  const localUnique = unique.filter(function(item) { return local.includes(item); });
  const fallback = unique.filter(function(item) { return !local.includes(item); });
  const distractors = shuffle(localUnique).slice(0, 3);
  if (distractors.length < 3) distractors.push.apply(distractors, shuffle(fallback).slice(0, 3 - distractors.length));
  while (distractors.length < 3) distractors.push("No corresponde con el contenido enseñado en esta unidad.");
  return shuffle([{ text: correct, correct: true }].concat(distractors.map(function(text) {
    return { text: text, correct: false };
  })));
}

function renderReview(assessment, unitId) {
  if (!assessment || !/^2\./.test(String(assessment.schema_version || "")) || !Array.isArray(assessment.concepts)) return "";
  const unitConcepts = assessment.concepts.filter(function(item) { return item.unit_id === unitId; });
  if (!unitConcepts.length) return "";

  const count = Math.min(Number(assessment.unit_review?.questions_per_attempt || 4), unitConcepts.length);
  const chosen = shuffle(unitConcepts).slice(0, count);
  const shortCandidates = chosen.filter(function(item) {
    return Array.isArray(item.accepted_short_answers_es) && item.accepted_short_answers_es.length;
  });
  const shortTarget = Math.min(Number(assessment.unit_review?.preferred_short_answers_per_attempt || 1), shortCandidates.length);
  const shortIds = new Set(shuffle(shortCandidates).slice(0, shortTarget).map(function(item) { return item.id; }));

  const questions = chosen.map(function(concept, index) {
    const answer = escapeHtml(concept.answer_display_es);
    const promptVariants = Array.isArray(concept.web_prompt_variants_es) && concept.web_prompt_variants_es.length
      ? concept.web_prompt_variants_es
      : [concept.web_prompt_es];
    const prompt = shuffle(promptVariants)[0] || concept.web_prompt_es;
    if (shortIds.has(concept.id)) {
      const encoded = encodeURIComponent(JSON.stringify(concept.accepted_short_answers_es));
      return '<article class="unit-review__question" data-review-question data-mode="short" data-accepted="' + encoded +
        '" data-answer="' + encodeURIComponent(concept.answer_display_es) + '">' +
        '<h3>' + (index + 1) + ". " + escapeHtml(prompt) + '</h3>' +
        '<input class="unit-review__short" type="text" autocomplete="off" placeholder="Respuesta corta">' +
        '<p class="unit-review__feedback" data-review-feedback></p></article>';
    }

    const options = multipleChoiceOptions(concept, unitConcepts, assessment.concepts).map(function(option, optionIndex) {
      return '<label class="unit-review__option"><input type="radio" name="review-' + escapeHtml(unitId) + "-" +
        index + '" value="' + optionIndex + '" data-correct="' + (option.correct ? "1" : "0") + '">' +
        '<span>' + escapeHtml(option.text) + "</span></label>";
    }).join("");

    return '<article class="unit-review__question" data-review-question data-mode="mcq" data-answer="' +
      encodeURIComponent(concept.answer_display_es) + '"><h3>' + (index + 1) + ". " +
      escapeHtml(prompt) + '</h3><div class="unit-review__options">' + options +
      '</div><p class="unit-review__feedback" data-review-feedback></p></article>';
  }).join("");

  return '<section class="unit-review" id="unit-review-' + escapeHtml(unitId) + '">' +
    '<header class="unit-review__header"><div><span>REPASO DINÁMICO</span><h2>Comprueba esta unidad</h2></div>' +
    '<p>Test + respuesta corta. Las preguntas se mezclan al generar un nuevo repaso.</p></header>' +
    questions + '<div class="unit-review__actions">' +
    '<button class="button button--primary" type="button" data-check-unit-review="' + escapeHtml(unitId) + '">Comprobar</button>' +
    '<button class="button button--secondary" type="button" data-new-unit-review="' + escapeHtml(unitId) + '">Generar otro repaso</button>' +
    '<strong class="unit-review__score" data-review-score></strong></div></section>';
}

export function checkUnitReview(root) {
  if (!root) return { correct: 0, total: 0 };
  const questions = Array.from(root.querySelectorAll("[data-review-question]"));
  let correct = 0;
  questions.forEach(function(question) {
    const feedback = question.querySelector("[data-review-feedback]");
    const answer = decodeURIComponent(question.dataset.answer || "");
    let ok = false;

    if (question.dataset.mode === "short") {
      const input = question.querySelector("input[type=text]");
      const accepted = JSON.parse(decodeURIComponent(question.dataset.accepted || "%5B%5D"));
      const given = normalizeAnswer(input ? input.value : "");
      ok = !!given && accepted.some(function(item) { return normalizeAnswer(item) === given; });
    } else {
      const selected = question.querySelector("input[type=radio]:checked");
      ok = !!selected && selected.dataset.correct === "1";
    }

    question.classList.toggle("is-correct", ok);
    question.classList.toggle("is-wrong", !ok);
    if (ok) {
      correct += 1;
      feedback.textContent = "Correcta.";
    } else {
      feedback.textContent = "Respuesta correcta: " + answer;
    }
  });
  const score = root.querySelector("[data-review-score]");
  if (score) score.textContent = correct + "/" + questions.length + " correctas";
  return { correct: correct, total: questions.length };
}

export function renderLesson(module, context) {
  const label = context && context.label ? context.label : "OPERACIONES DE SENSORES";
  const assessment = context && context.assessment ? context.assessment : null;
  return '<span class="lesson-kicker">' + label + " // " + module.id + "</span>" +
    "<h1>" + module.title + "</h1>" +
    '<p class="lesson-subtitle">' + module.subtitle + "</p>" +
    module.blocks.map(blockHtml).join("") +
    renderReview(assessment, module.id);
}
