const [report, history] = await Promise.all([
  fetch("/api/proof?histories=250").then((response) => response.json()),
  fetch("/api/history").then((response) => response.json())
]);

document.querySelector("#metrics").replaceChildren(...[
  ["Histories", report.histories.toLocaleString()],
  ["Chaos failures", report.chaosFailures],
  ["Divergence", report.divergenceEvents],
  ["Replay failures", report.replayFailures],
  ["Witness failures", report.witnessFailures],
  ["Converged hash", history.convergedHash.slice(0, 16)]
].map(([label, value]) => {
  const node = document.createElement("article");
  node.className = "metric";
  node.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return node;
}));

const benchmarkEntries = [
  ["histories/sec", report.benchmarks.historiesPerSecond],
  ["replay events/sec", report.benchmarks.replayEventsPerSecond],
  ["branch merge ms", report.benchmarks.branchMergeLatencyMs],
  ["convergence ms", report.benchmarks.convergenceLatencyMs],
  ["serialization ms", report.benchmarks.serializationCostMs],
  ["bytes/event", report.benchmarks.serializationBytesPerEvent],
  ["replay amplification", report.benchmarks.replayAmplification],
  ["memory MB", report.benchmarks.memoryGrowthMB]
];
const maxBenchmark = Math.max(...benchmarkEntries.map(([, value]) => Number(value)), 1);
document.querySelector("#benchmarks").replaceChildren(...benchmarkEntries.map(([label, value]) => {
  const node = document.createElement("article");
  node.className = "bar-row";
  node.innerHTML = `
    <span>${label}</span>
    <div><i style="width:${Math.max(4, (Number(value) / maxBenchmark) * 100)}%"></i></div>
    <strong>${Number(value).toFixed(Number(value) > 100 ? 0 : 3)}</strong>
  `;
  return node;
}));

document.querySelector("#chaos").replaceChildren(...Object.entries(report.chaos).map(([type, stats]) => {
  const node = document.createElement("article");
  node.className = "mini";
  node.innerHTML = `<strong>${type}</strong><span>${stats.detected}/${stats.injected} detected or survived</span><code>${stats.failures} failures</code>`;
  return node;
}));

document.querySelector("#witness").replaceChildren(...[
  ["event set", history.witness.eventSetHash],
  ["reducer", history.witness.reducerVersion],
  ["state", history.witness.stateHash],
  ["witness", history.witness.witnessHash]
].map(([label, value]) => {
  const node = document.createElement("article");
  node.className = "mini";
  node.innerHTML = `<strong>${label}</strong><code>${String(value).slice(0, 42)}</code>`;
  return node;
}));

document.querySelector("#branches").replaceChildren(...history.branches.map((branch) => {
  const node = document.createElement("article");
  node.className = "mini";
  node.innerHTML = `<strong>${branch.name}</strong><code>${branch.hash.slice(0, 24)}</code><span>${branch.eventCount} events</span>`;
  return node;
}));

document.querySelector("#dag").replaceChildren(...history.events.map((event, index) => {
  const node = document.createElement("article");
  node.className = "event-node";
  node.innerHTML = `<strong>${index + 1}. ${event.type}</strong><span>${event.nodeId} L${event.lamport}</span><code>${event.id.slice(0, 18)}</code>`;
  return node;
}));

document.querySelector("#timeRail").replaceChildren(...history.deterministicTime.map((sample) => {
  const node = document.createElement("article");
  node.className = "event-node";
  node.innerHTML = `<strong>slot ${sample.causalSlot}</strong><span>${sample.nodeId} logical ${sample.logicalTime}</span><code>wall ${sample.wallTime}</code>`;
  return node;
}));

const scrubber = document.querySelector("#scrubber");
const eventView = document.querySelector("#eventView");
scrubber.max = String(history.events.length - 1);
function renderEvent() {
  eventView.textContent = JSON.stringify(history.events[Number(scrubber.value)], null, 2);
}
scrubber.addEventListener("input", renderEvent);
renderEvent();
