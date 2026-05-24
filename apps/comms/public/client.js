import {
  CommunicationRuntime,
  decodeHandshakeBundle,
  encodeHandshakeBundle
} from "/modules/comms-module.js";

const iceConfig = {
  iceServers: []
};

const state = {
  runtime: null,
  roomId: null,
  userId: crypto.randomUUID(),
  displayName: "",
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  dataChannel: null,
  pendingLocalBundle: "",
  handshakeMode: "creator"
};

const elements = {
  displayName: document.querySelector("#displayName"),
  roomId: document.querySelector("#roomId"),
  startButton: document.querySelector("#startButton"),
  joinButton: document.querySelector("#joinButton"),
  copyBundleButton: document.querySelector("#copyBundleButton"),
  applyBundleButton: document.querySelector("#applyBundleButton"),
  handshakeInput: document.querySelector("#handshakeInput"),
  bundlePreview: document.querySelector("#bundlePreview"),
  statusLine: document.querySelector("#statusLine"),
  hashLine: document.querySelector("#hashLine"),
  peerLine: document.querySelector("#peerLine"),
  localVideo: document.querySelector("#localVideo"),
  remoteVideo: document.querySelector("#remoteVideo"),
  toggleAudioButton: document.querySelector("#toggleAudioButton"),
  toggleVideoButton: document.querySelector("#toggleVideoButton"),
  endButton: document.querySelector("#endButton"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  eventLog: document.querySelector("#eventLog")
};

elements.startButton.addEventListener("click", () => beginSession("creator"));
elements.joinButton.addEventListener("click", () => beginSession("joiner"));
elements.copyBundleButton.addEventListener("click", copyBundle);
elements.applyBundleButton.addEventListener("click", applyBundle);
elements.toggleAudioButton.addEventListener("click", toggleAudio);
elements.toggleVideoButton.addEventListener("click", toggleVideo);
elements.endButton.addEventListener("click", endSession);
elements.chatForm.addEventListener("submit", sendChat);

async function beginSession(mode) {
  state.handshakeMode = mode;
  state.displayName = elements.displayName.value.trim() || "Anonymous";
  state.roomId = elements.roomId.value.trim() || "dus-room";
  state.runtime = new CommunicationRuntime(state.userId, state.roomId);
  state.runtime.startSession(Date.now());
  state.runtime.peerJoined({
    userId: state.userId,
    displayName: state.displayName,
    joinedAt: Date.now()
  });

  await ensureLocalMedia();
  await setupPeerConnection(mode === "creator");
  render();

  if (mode === "joiner") {
    updateStatus("Paste the creator invite bundle, then click Apply Bundle.");
  } else {
    updateStatus("Creating local offer. Share the invite bundle with your peer.");
  }
}

async function ensureLocalMedia() {
  if (state.localStream) return;
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: 640, height: 360 }
    });
    elements.localVideo.srcObject = state.localStream;
  } catch (error) {
    updateStatus(`Media access failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setupPeerConnection(isCreator) {
  const pc = new RTCPeerConnection(iceConfig);
  state.peerConnection = pc;
  state.remoteStream = new MediaStream();
  elements.remoteVideo.srcObject = state.remoteStream;

  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      pc.addTrack(track, state.localStream);
    }
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
    updateStatus("Remote media received.");
  };

  pc.onconnectionstatechange = () => {
    const connectionState = pc.connectionState === "connected" ? "connected" : pc.connectionState === "disconnected" ? "disconnected" : "connecting";
    state.runtime.peerConnection({
      userId: "remote-peer",
      connectionState
    }, Date.now());
    render();
  };

  pc.onicecandidate = async () => {
    if (!pc.localDescription) return;
    state.pendingLocalBundle = await buildBundle({
      kind: isCreator ? "offer" : "answer",
      sdp: pc.localDescription
    });
    render();
  };

  pc.ondatachannel = (event) => {
    attachDataChannel(event.channel);
  };

  if (isCreator) {
    const channel = pc.createDataChannel("dus-events");
    attachDataChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  }
}

function attachDataChannel(channel) {
  state.dataChannel = channel;
  channel.onopen = () => {
    updateStatus("Peer data channel open. Events now sync directly between browsers.");
    state.runtime.peerConnection({ userId: "remote-peer", connectionState: "connected" }, Date.now());
    syncAllEvents();
    render();
  };
  channel.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "dus-events") {
      const events = decodeHandshakeBundle(message.bundle);
      state.runtime.sync(events);
      render();
    }
  };
}

async function buildBundle({ kind, sdp }) {
  state.runtime.signaling({
    kind,
    fromUserId: state.userId,
    payload: JSON.stringify(sdp),
    createdAt: Date.now()
  });
  const bundle = {
    roomId: state.roomId,
    userId: state.userId,
    displayName: state.displayName,
    kind,
    sdp,
    dusEvents: state.runtime.getEvents()
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(bundle))));
}

async function applyBundle() {
  if (!state.peerConnection || !state.runtime) return;
  const raw = elements.handshakeInput.value.trim();
  if (!raw) {
    updateStatus("Paste a bundle first.");
    return;
  }

  const bundle = JSON.parse(decodeURIComponent(escape(atob(raw))));
  state.runtime.sync(bundle.dusEvents);
  state.runtime.peerJoined({
    userId: bundle.userId,
    displayName: bundle.displayName,
    joinedAt: Date.now()
  });
  elements.peerLine.textContent = `peer: ${bundle.displayName}`;

  if (bundle.kind === "offer") {
    await state.peerConnection.setRemoteDescription(bundle.sdp);
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    state.pendingLocalBundle = await buildBundle({ kind: "answer", sdp: state.peerConnection.localDescription });
    updateStatus("Answer created. Send your answer bundle back to the creator.");
  } else if (bundle.kind === "answer") {
    await state.peerConnection.setRemoteDescription(bundle.sdp);
    updateStatus("Answer applied. Waiting for connection.");
  }
  render();
}

async function copyBundle() {
  if (!state.pendingLocalBundle) {
    updateStatus("No local bundle yet.");
    return;
  }
  await navigator.clipboard.writeText(state.pendingLocalBundle);
  updateStatus("Bundle copied to clipboard.");
}

function syncAllEvents() {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") return;
  state.dataChannel.send(JSON.stringify({
    type: "dus-events",
    bundle: encodeHandshakeBundle(state.runtime.getEvents())
  }));
}

function toggleAudio() {
  if (!state.localStream || !state.runtime) return;
  const track = state.localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  state.runtime.peerMedia({
    userId: state.userId,
    audioEnabled: track.enabled,
    videoEnabled: state.localStream.getVideoTracks()[0]?.enabled ?? true
  }, Date.now());
  syncAllEvents();
  render();
}

function toggleVideo() {
  if (!state.localStream || !state.runtime) return;
  const track = state.localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  state.runtime.peerMedia({
    userId: state.userId,
    audioEnabled: state.localStream.getAudioTracks()[0]?.enabled ?? true,
    videoEnabled: track.enabled
  }, Date.now());
  syncAllEvents();
  render();
}

function endSession() {
  if (state.runtime) {
    state.runtime.endSession(Date.now());
  }
  state.peerConnection?.close();
  state.dataChannel?.close();
  updateStatus("Session ended.");
  render();
}

function sendChat(event) {
  event.preventDefault();
  if (!state.runtime || !state.dataChannel || state.dataChannel.readyState !== "open") return;
  const body = elements.chatInput.value.trim();
  if (!body) return;
  state.runtime.chat({
    id: crypto.randomUUID(),
    fromUserId: state.userId,
    body,
    createdAt: Date.now()
  });
  syncAllEvents();
  elements.chatInput.value = "";
  render();
}

function updateStatus(text) {
  elements.statusLine.textContent = text;
}

function render() {
  if (!state.runtime) return;
  const current = state.runtime.getState();
  elements.hashLine.textContent = `state: ${current.timelineHash.slice(0, 16)}…`;
  elements.bundlePreview.textContent = state.pendingLocalBundle || "No local bundle yet.";
  elements.eventLog.textContent = JSON.stringify({
    snapshot: state.runtime.snapshot(),
    log: state.runtime.logSnapshot()
  }, null, 2);

  elements.chatLog.innerHTML = "";
  for (const message of current.chat.slice().reverse()) {
    const item = document.createElement("article");
    item.className = "chat-item";
    item.textContent = `${message.fromUserId}: ${message.body}`;
    elements.chatLog.appendChild(item);
  }
}
