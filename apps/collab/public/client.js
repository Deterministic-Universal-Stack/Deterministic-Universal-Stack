const state = {
  socket: null,
  roomId: null,
  userId: crypto.randomUUID(),
  displayName: "",
  color: "#b55d32",
  connected: false,
  lastState: null,
  editorUpdateTimer: null,
  deferredInstallPrompt: null
};

const elements = {
  connectionBadge: document.querySelector("#connectionBadge"),
  connectButton: document.querySelector("#connectButton"),
  nameInput: document.querySelector("#nameInput"),
  roomInput: document.querySelector("#roomInput"),
  colorInput: document.querySelector("#colorInput"),
  githubUrlInput: document.querySelector("#githubUrlInput"),
  githubImportButton: document.querySelector("#githubImportButton"),
  githubStatus: document.querySelector("#githubStatus"),
  githubSource: document.querySelector("#githubSource"),
  downloadHtmlButton: document.querySelector("#downloadHtmlButton"),
  copyHtmlButton: document.querySelector("#copyHtmlButton"),
  installButton: document.querySelector("#installButton"),
  editor: document.querySelector("#editor"),
  preview: document.querySelector("#preview"),
  titleInput: document.querySelector("#titleInput"),
  lastEdited: document.querySelector("#lastEdited"),
  presenceList: document.querySelector("#presenceList"),
  stateHash: document.querySelector("#stateHash"),
  eventCount: document.querySelector("#eventCount"),
  frontierCount: document.querySelector("#frontierCount"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  witnessPrompt: document.querySelector("#witnessPrompt"),
  suggestButton: document.querySelector("#suggestButton"),
  chatWitnessButton: document.querySelector("#chatWitnessButton"),
  witnessLog: document.querySelector("#witnessLog"),
  witnessEntryTemplate: document.querySelector("#witnessEntryTemplate"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  formatButton: document.querySelector("#formatButton")
};

bootstrapFromUrl();
wireEvents();
renderPreview("");
registerServiceWorker();

function bootstrapFromUrl() {
  const url = new URL(window.location.href);
  const room = url.searchParams.get("room") ?? "lobby";
  const name = url.searchParams.get("name") ?? "";
  const color = url.searchParams.get("color") ?? "#b55d32";
  const github = localStorage.getItem("dus.githubUrl") ?? "";
  elements.roomInput.value = room;
  elements.nameInput.value = name;
  elements.colorInput.value = color;
  elements.githubUrlInput.value = github;
}

function wireEvents() {
  elements.connectButton.addEventListener("click", connect);
  elements.editor.addEventListener("input", handleEditorInput);
  elements.titleInput.addEventListener("input", handleEditorInput);
  elements.chatForm.addEventListener("submit", handleChatSubmit);
  elements.suggestButton.addEventListener("click", () => askWitness("suggest"));
  elements.chatWitnessButton.addEventListener("click", () => askWitness("chat"));
  elements.copyLinkButton.addEventListener("click", copyRoomLink);
  elements.formatButton.addEventListener("click", formatHtml);
  elements.githubImportButton.addEventListener("click", importFromGitHub);
  elements.downloadHtmlButton.addEventListener("click", downloadHtml);
  elements.copyHtmlButton.addEventListener("click", copyHtml);
  elements.installButton.addEventListener("click", installChromeApp);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installButton.disabled = false;
  });
}

function connect() {
  const displayName = elements.nameInput.value.trim() || "Anonymous";
  const roomId = elements.roomInput.value.trim() || "lobby";
  const color = elements.colorInput.value;

  state.displayName = displayName;
  state.roomId = roomId;
  state.color = color;

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("name", displayName);
  url.searchParams.set("color", color);
  window.history.replaceState({}, "", url);
  localStorage.setItem("dus.name", displayName);
  localStorage.setItem("dus.room", roomId);
  localStorage.setItem("dus.color", color);

  if (state.socket) {
    state.socket.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(state.userId)}&name=${encodeURIComponent(displayName)}&color=${encodeURIComponent(color)}`;
  const socket = new WebSocket(wsUrl);
  state.socket = socket;

  socket.addEventListener("open", () => {
    state.connected = true;
    updateConnectionBadge("Connected", true);
  });

  socket.addEventListener("close", () => {
    state.connected = false;
    updateConnectionBadge("Disconnected", false);
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "room/state") {
      state.lastState = payload.state;
      renderState(payload.state, payload.snapshot, payload.verification);
    }
    if (payload.type === "room/error") {
      alert(payload.error);
    }
  });
}

function updateConnectionBadge(text, connected) {
  elements.connectionBadge.textContent = text;
  elements.connectionBadge.className = connected ? "badge badge-soft" : "badge badge-warm";
}

function handleEditorInput() {
  renderPreview(elements.editor.value);
  if (!state.connected || !state.socket) {
    return;
  }
  clearTimeout(state.editorUpdateTimer);
  state.editorUpdateTimer = setTimeout(() => {
    state.socket.send(JSON.stringify({
      type: "doc/set_html",
      payload: {
        html: elements.editor.value,
        title: elements.titleInput.value || "Untitled",
        githubSource: state.lastState?.githubSource ?? null,
        editedAt: Date.now()
      }
    }));
  }, 150);
}

function handleChatSubmit(event) {
  event.preventDefault();
  if (!state.socket || !state.connected) {
    return;
  }
  const body = elements.chatInput.value.trim();
  if (!body) {
    return;
  }
  state.socket.send(JSON.stringify({
    type: "chat/post",
    payload: { body }
  }));
  elements.chatInput.value = "";
}

async function askWitness(mode) {
  if (!state.roomId) {
    alert("Enter a room first.");
    return;
  }
  const prompt = elements.witnessPrompt.value.trim();
  if (!prompt) {
    alert("Ask the witness something first.");
    return;
  }

  const response = await fetch("/api/ollama/witness", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomId: state.roomId,
      userId: state.userId,
      mode,
      prompt
    })
  });
  const payload = await response.json();
  if (!payload.ok) {
    alert(payload.error || "Witness call failed.");
    return;
  }
  elements.witnessPrompt.value = "";
}

function renderState(nextState, snapshot, verification) {
  if (!document.activeElement || document.activeElement !== elements.editor) {
    elements.editor.value = nextState.html;
  }
  if (document.activeElement !== elements.titleInput) {
    elements.titleInput.value = nextState.title;
  }

  renderPreview(nextState.html);
  elements.stateHash.textContent = `state: ${snapshot.state.hash.slice(0, 12)}…`;
  elements.eventCount.textContent = String(snapshot.eventCount);
  elements.frontierCount.textContent = String(snapshot.frontier.length);
  elements.lastEdited.textContent = nextState.lastEditedBy
    ? `Last edited by ${nextState.lastEditedBy} at ${new Date(nextState.lastEditedAt).toLocaleTimeString()}`
    : "Waiting for first edit.";
  elements.githubSource.textContent = `GitHub source: ${nextState.githubSource ?? "none"}`;

  renderPresence(nextState.collaborators, verification);
  renderChat(nextState.chat);
  renderWitness(nextState.witnessLog);
}

async function importFromGitHub() {
  if (!state.roomId) {
    alert("Enter a room first.");
    return;
  }
  const url = elements.githubUrlInput.value.trim();
  if (!url) {
    alert("Paste a GitHub blob or raw URL first.");
    return;
  }
  localStorage.setItem("dus.githubUrl", url);
  elements.githubStatus.textContent = "Importing from GitHub...";
  const response = await fetch("/api/github/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomId: state.roomId,
      userId: state.userId,
      displayName: state.displayName || "GitHub Import",
      url
    })
  });
  const payload = await response.json();
  if (!payload.ok) {
    elements.githubStatus.textContent = payload.error || "GitHub import failed.";
    return;
  }
  elements.githubStatus.textContent = `Imported ${payload.title} from GitHub.`;
}

function downloadHtml() {
  const blob = new Blob([elements.editor.value], { type: "text/html;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${slugify(elements.titleInput.value || "dus-room")}.html`;
  link.click();
  URL.revokeObjectURL(href);
}

async function copyHtml() {
  await navigator.clipboard.writeText(elements.editor.value);
  elements.githubStatus.textContent = "HTML copied to clipboard.";
}

async function installChromeApp() {
  if (!state.deferredInstallPrompt) {
    elements.githubStatus.textContent = "Use Chrome or Edge and open the install menu when available.";
    return;
  }
  state.deferredInstallPrompt.prompt();
  const result = await state.deferredInstallPrompt.userChoice;
  elements.githubStatus.textContent = result.outcome === "accepted"
    ? "App installed."
    : "Install dismissed.";
  state.deferredInstallPrompt = null;
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch {
      // Non-fatal for local use.
    }
  }
}

function renderPreview(html) {
  elements.preview.srcdoc = html;
}

function renderPresence(collaborators, verification) {
  elements.presenceList.innerHTML = "";
  const items = Object.values(collaborators);
  for (const collaborator of items) {
    const li = document.createElement("li");
    li.className = "presence-item";
    li.innerHTML = `
      <span class="presence-dot" style="background:${collaborator.color}"></span>
      <div>
        <strong>${escapeHtml(collaborator.displayName)}</strong>
        <div class="hint">${collaborator.isOnline ? "online" : "offline"}</div>
      </div>
    `;
    elements.presenceList.appendChild(li);
  }

  if (!verification.isValid) {
    const li = document.createElement("li");
    li.className = "presence-item";
    li.innerHTML = `<div class="hint">Verification issues: ${verification.errors.join("; ")}</div>`;
    elements.presenceList.appendChild(li);
  }
}

function renderChat(messages) {
  elements.chatLog.innerHTML = "";
  for (const message of messages.slice(-30)) {
    const article = document.createElement("article");
    article.className = "chat-bubble";
    article.innerHTML = `
      <div class="chat-author">${escapeHtml(message.displayName)}</div>
      <p class="chat-body">${escapeHtml(message.body)}</p>
    `;
    elements.chatLog.appendChild(article);
  }
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function renderWitness(entries) {
  elements.witnessLog.innerHTML = "";
  for (const entry of entries.slice().reverse()) {
    const node = elements.witnessEntryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".witness-mode").textContent = entry.mode === "suggest" ? "Suggestion" : "Witness chat";
    node.querySelector(".witness-question").textContent = entry.prompt;
    node.querySelector(".witness-response").textContent = entry.response;
    const applyButton = node.querySelector(".apply-button");
    if (entry.extractedHtml) {
      applyButton.hidden = false;
      applyButton.addEventListener("click", () => {
        if (!state.socket || !state.connected) {
          return;
        }
        state.socket.send(JSON.stringify({
          type: "witness/apply_html",
          payload: {
            html: entry.extractedHtml,
            title: elements.titleInput.value || "Untitled"
          }
        }));
      });
    }
    elements.witnessLog.appendChild(node);
  }
}

async function copyRoomLink() {
  const url = new URL(window.location.href);
  await navigator.clipboard.writeText(url.toString());
  elements.copyLinkButton.textContent = "Copied";
  setTimeout(() => {
    elements.copyLinkButton.textContent = "Copy Room Link";
  }, 1200);
}

function formatHtml() {
  const html = elements.editor.value;
  elements.editor.value = html
    .replace(/></g, ">\n<")
    .replace(/\n{3,}/g, "\n\n");
  handleEditorInput();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dus-room";
}
