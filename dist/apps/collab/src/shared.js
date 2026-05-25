import { canonicalHash } from "@dus/core";
export function defaultHtml(roomId) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DUS Room ${roomId}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #f8f3ea;
        --ink: #1d1b19;
        --accent: #b55d32;
        --soft: #e6d5bf;
      }
      body {
        margin: 0;
        padding: 3rem;
        font-family: Georgia, "Times New Roman", serif;
        background: radial-gradient(circle at top, #fffdf8, var(--paper));
        color: var(--ink);
      }
      main {
        max-width: 56rem;
        margin: 0 auto;
        padding: 2rem;
        border-radius: 1.5rem;
        background: rgba(255, 255, 255, 0.78);
        box-shadow: 0 18px 70px rgba(77, 52, 31, 0.12);
        border: 1px solid rgba(181, 93, 50, 0.16);
      }
      h1 {
        margin-top: 0;
        font-size: clamp(2rem, 3vw, 3.25rem);
        line-height: 1;
      }
      p {
        font-size: 1.08rem;
        line-height: 1.7;
      }
      .note {
        margin-top: 1.5rem;
        padding: 1rem 1.2rem;
        background: var(--soft);
        border-left: 4px solid var(--accent);
        border-radius: 0.85rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hello from DUS</h1>
      <p>This HTML file is live, collaborative, and derived from an immutable event stream.</p>
      <p>Edit this together with a friend and watch the preview synchronize in real time.</p>
      <div class="note">Room: ${roomId}</div>
    </main>
  </body>
</html>`;
}
export function createInitialCollaborationState(roomId) {
    return {
        roomId,
        html: defaultHtml(roomId),
        title: `DUS Room ${roomId}`,
        collaborators: {},
        chat: [],
        witnessLog: []
    };
}
export const collaborationReducer = (state, event) => {
    const next = {
        roomId: state.value.roomId,
        html: state.value.html,
        title: state.value.title,
        githubSource: state.value.githubSource,
        lastEditedBy: state.value.lastEditedBy,
        lastEditedAt: state.value.lastEditedAt,
        collaborators: { ...state.value.collaborators },
        chat: [...state.value.chat],
        witnessLog: [...state.value.witnessLog]
    };
    switch (event.type) {
        case "collab/join": {
            const payload = event.payload;
            next.collaborators[payload.userId] = {
                userId: payload.userId,
                displayName: payload.displayName,
                joinedAt: payload.joinedAt,
                color: payload.color,
                isOnline: true
            };
            break;
        }
        case "collab/leave": {
            const payload = event.payload;
            const collaborator = next.collaborators[payload.userId];
            if (collaborator) {
                next.collaborators[payload.userId] = {
                    ...collaborator,
                    isOnline: false
                };
            }
            break;
        }
        case "doc/set_html": {
            const payload = event.payload;
            next.html = payload.html;
            next.title = payload.title;
            next.githubSource = payload.githubSource;
            next.lastEditedBy = payload.displayName;
            next.lastEditedAt = payload.editedAt;
            break;
        }
        case "chat/post": {
            const payload = event.payload;
            next.chat.push(payload);
            next.chat = next.chat.slice(-100);
            break;
        }
        case "witness/record": {
            const payload = event.payload;
            next.witnessLog.push(payload);
            next.witnessLog = next.witnessLog.slice(-24);
            break;
        }
        default:
            break;
    }
    return {
        value: next,
        hash: canonicalHash(next),
        eventCount: state.eventCount + 1n
    };
};
export function summarizeWitnessContext(state) {
    const recentChat = state.chat.slice(-8).map((message) => `${message.displayName}: ${message.body}`).join("\n");
    const online = Object.values(state.collaborators).filter((entry) => entry.isOnline).map((entry) => entry.displayName);
    return [
        `Room: ${state.roomId}`,
        `Title: ${state.title}`,
        `GitHub source: ${state.githubSource ?? "none"}`,
        `State hash: ${canonicalHash(state)}`,
        `Online collaborators: ${online.join(", ") || "none"}`,
        `Last editor: ${state.lastEditedBy ?? "unknown"}`,
        `Recent chat:\n${recentChat || "(no recent chat)"}`,
        `HTML:\n${state.html}`
    ].join("\n\n");
}
export function extractHtmlBlock(text) {
    const match = text.match(/```html\s*([\s\S]*?)```/i);
    return match?.[1]?.trim();
}
export function normalizeGitHubContentUrl(input) {
    const url = new URL(input);
    if (url.hostname === "raw.githubusercontent.com") {
        return url.toString();
    }
    if (url.hostname === "github.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 5 && parts[2] === "blob") {
            const [owner, repo, _blob, branch, ...fileParts] = parts;
            return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileParts.join("/")}`;
        }
    }
    throw new Error("Use a GitHub blob URL or raw.githubusercontent.com URL.");
}
//# sourceMappingURL=shared.js.map