const grid = document.querySelector("#appGrid");
const languageLine = document.querySelector("#languageLine");

const graph = await fetch("/api/apps").then((response) => response.json());
languageLine.textContent = graph.languages.map((binding) => `${binding.name}: ${binding.status}`).join(" / ");

grid.replaceChildren(...graph.apps.map((app) => {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <p class="eyebrow">${app.kind}</p>
    <h2>${app.name}</h2>
    <code>${app.command}</code>
    <a class="button" href="${app.url}">Open GUI</a>
  `;
  return card;
}));
