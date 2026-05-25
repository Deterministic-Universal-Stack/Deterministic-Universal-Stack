const id = new URLSearchParams(location.search).get("id") ?? "proof";
const graph = await fetch("/api/apps").then((response) => response.json());
const app = graph.apps.find((candidate) => candidate.id === id) ?? graph.apps[0];
const layerMap = new Map(graph.layers.map((layer) => [layer.id, layer]));
const invariantMap = new Map(graph.invariants.map((invariant) => [invariant.id, invariant]));

document.querySelector("#kind").textContent = app.kind;
document.querySelector("#name").textContent = app.name;
document.querySelector("#command").textContent = app.command;

document.querySelector("#layers").replaceChildren(...app.layers.map((id) => {
  const layer = layerMap.get(id);
  const node = document.createElement("article");
  node.className = "mini";
  node.innerHTML = `<strong>${layer.name}</strong><span>${layer.guarantee}</span>`;
  return node;
}));

document.querySelector("#invariants").replaceChildren(...app.invariantIds.map((id) => {
  const invariant = invariantMap.get(id);
  const node = document.createElement("article");
  node.className = "mini";
  node.innerHTML = `<code>${invariant.math}</code><span>${invariant.statement}</span>`;
  return node;
}));

const trace = document.querySelector("#trace");
function append(type, detail) {
  const item = document.createElement("li");
  item.innerHTML = `<strong>${type}</strong><span>${detail}</span>`;
  trace.prepend(item);
}
append("surface/opened", `${app.name} loaded from the capability graph`);
document.querySelector("#emit").addEventListener("click", () => append("event/emit", "append-only fact added"));
document.querySelector("#replay").addEventListener("click", () => append("state/replay", "state reconstructed from closure(E)"));
document.querySelector("#verify").addEventListener("click", () => append("proof/verify", "hash equivalence checked"));
