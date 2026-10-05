export async function loadEvaluationData() {
  const response = await fetch("data/evaluacion-sensores.json?v=0.2.2");
  if (!response.ok) throw new Error("No se pudo cargar la evaluación.");
  return response.json();
}

export function renderExam(exam) {
  var questions = exam.questions.map(function(q, index) {
    var options = q.options.map(function(option, optionIndex) {
      return '<label class="option"><input type="radio" name="' + q.id + '" value="' + optionIndex + '" required><span>' + option + "</span></label>";
    }).join("");
    return '<section class="question-card"><h3>' + (index + 1) + ". " + q.question + "</h3>" + options + "</section>";
  }).join("");

  return '<header class="exam-header">' +
    '<span class="overline">EVALUACIÓN ACADÉMICA // ' + exam.code + "</span>" +
    "<h1>" + exam.title + "</h1>" +
    "<p>" + exam.questions.length + " preguntas. Para aprobar se requiere un mínimo del " + exam.passingScore + " %. Todas las respuestas deben completarse antes de entregar.</p>" +
    "</header>" +
    '<form id="exam-form">' + questions +
    '<div class="exam-submit"><button class="button button--primary" type="submit">Entregar evaluación</button></div></form>';
}

export function gradeExam(exam, formData) {
  var correct = 0;
  var review = exam.questions.map(function(question) {
    var selected = Number(formData.get(question.id));
    var isCorrect = selected === question.correctIndex;
    if (isCorrect) correct += 1;
    return { question: question, selected: selected, isCorrect: isCorrect };
  });
  var score = Math.round((correct / exam.questions.length) * 100);
  return { correct: correct, total: exam.questions.length, score: score, passed: score >= exam.passingScore, review: review };
}

export function renderResult(result) {
  var review = result.review.map(function(item, index) {
    return '<div class="review-item ' + (item.isCorrect ? "" : "is-wrong") + '">' +
      "<strong>" + (index + 1) + ". " + (item.isCorrect ? "Correcta" : "Incorrecta") + "</strong>" +
      "<p>" + item.question.explanation + "</p></div>";
  }).join("");

  return '<section class="exam-result ' + (result.passed ? "" : "is-failed") + '">' +
    '<span class="overline">RESULTADO REGISTRADO</span>' +
    '<div class="exam-result__score">' + result.score + "%</div>" +
    "<h2>" + (result.passed ? "Evaluación superada" : "Evaluación no superada") + "</h2>" +
    "<p>" + result.correct + " respuestas correctas de " + result.total + ".</p>" +
    review +
    '<p><button class="button button--secondary" data-route="evaluations">Volver a evaluaciones</button></p></section>';
}