export async function loadStudyFile(path) {
  if (!path) throw new Error("El material de estudio no tiene un archivo asociado.");
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(path + separator + "v=0.5.0");
  if (!response.ok) throw new Error("No se pudo cargar el material académico.");
  return response.json();
}

export async function loadStudyData() {
  return loadStudyFile("data/sensores.json");
}

function blockHtml(block) {
  if (block.type === "p") return "<p>" + block.text + "</p>";

  if (block.type === "quote") {
    return '<blockquote class="lesson-quote">' + block.text + "</blockquote>";
  }

  if (block.type === "heading") {
    return '<h2 class="lesson-section-title">' + block.text + "</h2>";
  }

  if (block.type === "definition") {
    return '<div class="definition-block"><strong>' + block.term + '</strong><p>' + block.text + "</p></div>";
  }

  if (block.type === "bullets") {
    return "<ul>" + block.items.map(function(item) { return "<li>" + item + "</li>"; }).join("") + "</ul>";
  }

  if (block.type === "numbered") {
    return "<ol>" + block.items.map(function(item) { return "<li>" + item + "</li>"; }).join("") + "</ol>";
  }

  if (block.type === "callout") {
    return '<div class="callout"><strong>' + block.label + "</strong><p>" + block.text + "</p></div>";
  }

  if (block.type === "procedure") {
    return '<section class="procedure"><h3>' + block.title + "</h3><ol>" +
      block.steps.map(function(step) { return "<li>" + step + "</li>"; }).join("") +
      "</ol></section>";
  }

  if (block.type === "table") {
    return '<div class="data-table-wrap"><table class="data-table"><thead><tr>' +
      block.headers.map(function(h) { return "<th>" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      block.rows.map(function(row) {
        return "<tr>" + row.map(function(cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  return "";
}

export function renderLesson(module, context) {
  const label = context && context.label ? context.label : "OPERACIONES DE SENSORES";
  return '<span class="lesson-kicker">' + label + " // " + module.id + "</span>" +
    "<h1>" + module.title + "</h1>" +
    '<p class="lesson-subtitle">' + module.subtitle + "</p>" +
    module.blocks.map(blockHtml).join("");
}
