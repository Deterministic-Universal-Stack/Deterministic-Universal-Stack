import { canonicalHash, type Reducer } from "@dus/core";

export interface Collaborator {
  userId: string;
  displayName: string;
  joinedAt: number;
  color: string;
  isOnline: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  timestamp: number;
}

export interface WitnessEntry {
  id: string;
  userId: string;
  mode: "chat" | "suggest";
  prompt: string;
  response: string;
  extractedHtml?: string;
  timestamp: number;
}

export interface CollaborationState {
  roomId: string;
  html: string;
  title: string;
  lastEditedBy?: string;
  lastEditedAt?: number;
  collaborators: Record<string, Collaborator>;
  chat: ChatMessage[];
  witnessLog: WitnessEntry[];
}

export interface JoinPayload {
  userId: string;
  displayName: string;
  color: string;
  joinedAt: number;
}

export interface LeavePayload {
  userId: string;
}

export interface HtmlUpdatePayload {
  userId: string;
  displayName: string;
  html: string;
  title: string;
  editedAt: number;
}

export interface ChatPayload {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  timestamp: number;
}

export interface WitnessPayload extends WitnessEntry {}

export function defaultHtml(roomId: string): string {
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

export function createInitialCollaborationState(roomId: string): CollaborationState {
  return {
    roomId,
    html: defaultHtml(roomId),
    title: `DUS Room ${roomId}`,
    collaborators: {},
    chat: [],
    witnessLog: []
  };
}

export const collaborationReducer: Reducer<CollaborationState> = (state, event) => {
  const next: CollaborationState = {
    roomId: state.value.roomId,
    html: state.value.html,
    title: state.value.title,
    lastEditedBy: state.value.lastEditedBy,
    lastEditedAt: state.value.lastEditedAt,
    collaborators: { ...state.value.collaborators },
    chat: [...state.value.chat],
    witnessLog: [...state.value.witnessLog]
  };

  switch (event.type) {
    case "collab/join": {
      const payload = event.payload as JoinPayload;
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
      const payload = event.payload as LeavePayload;
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
      const payload = event.payload as HtmlUpdatePayload;
      next.html = payload.html;
      next.title = payload.title;
      next.lastEditedBy = payload.displayName;
      next.lastEditedAt = payload.editedAt;
      break;
    }
    case "chat/post": {
      const payload = event.payload as ChatPayload;
      next.chat.push(payload);
      next.chat = next.chat.slice(-100);
      break;
    }
    case "witness/record": {
      const payload = event.payload as WitnessPayload;
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

export function summarizeWitnessContext(state: CollaborationState): string {
  const recentChat = state.chat.slice(-8).map((message) => `${message.displayName}: ${message.body}`).join("\n");
  const online = Object.values(state.collaborators).filter((entry) => entry.isOnline).map((entry) => entry.displayName);
  return [
    `Room: ${state.roomId}`,
    `Title: ${state.title}`,
    `State hash: ${canonicalHash(state)}`,
    `Online collaborators: ${online.join(", ") || "none"}`,
    `Last editor: ${state.lastEditedBy ?? "unknown"}`,
    `Recent chat:\n${recentChat || "(no recent chat)"}`,
    `HTML:\n${state.html}`
  ].join("\n\n");
}

export function extractHtmlBlock(text: string): string | undefined {
  const match = text.match(/```html\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}
