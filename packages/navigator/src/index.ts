import { DUS, canonicalHash, type Event, type Reducer } from "@dus/core";

export interface NavigatorTab {
  id: string;
  windowId: string;
  title: string;
  url: string;
  isActive: boolean;
  openedAt: number;
}

export interface NavigatorWindow {
  id: string;
  title: string;
  tabOrder: string[];
  createdAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  savedAt: number;
}

export interface HistoryEntry {
  id: string;
  tabId: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface BrowserProfileState {
  profileId: string;
  windows: Record<string, NavigatorWindow>;
  tabs: Record<string, NavigatorTab>;
  bookmarks: Record<string, Bookmark>;
  history: HistoryEntry[];
  downloads: Array<{ id: string; title: string; url: string; startedAt: number }>;
  activeWindowId?: string;
}

export function createInitialBrowserProfile(profileId: string): BrowserProfileState {
  return {
    profileId,
    windows: {},
    tabs: {},
    bookmarks: {},
    history: [],
    downloads: []
  };
}

type WindowPayload = {
  id: string;
  title: string;
  createdAt: number;
};

type TabPayload = {
  id: string;
  windowId: string;
  title: string;
  url: string;
  openedAt: number;
};

type NavigatePayload = {
  tabId: string;
  title: string;
  url: string;
  visitedAt: number;
};

type BookmarkPayload = {
  id: string;
  title: string;
  url: string;
  savedAt: number;
};

type DownloadPayload = {
  id: string;
  title: string;
  url: string;
  startedAt: number;
};

export const navigatorReducer: Reducer<BrowserProfileState> = (state, event) => {
  const next: BrowserProfileState = {
    profileId: state.value.profileId,
    windows: Object.fromEntries(Object.entries(state.value.windows).map(([key, value]) => [key, { ...value, tabOrder: [...value.tabOrder] }])),
    tabs: Object.fromEntries(Object.entries(state.value.tabs).map(([key, value]) => [key, { ...value }])),
    bookmarks: { ...state.value.bookmarks },
    history: [...state.value.history],
    downloads: [...state.value.downloads],
    activeWindowId: state.value.activeWindowId
  };

  switch (event.type) {
    case "navigator/open_window": {
      const payload = event.payload as WindowPayload;
      next.windows[payload.id] = {
        id: payload.id,
        title: payload.title,
        tabOrder: [],
        createdAt: payload.createdAt
      };
      next.activeWindowId = payload.id;
      break;
    }
    case "navigator/open_tab": {
      const payload = event.payload as TabPayload;
      Object.values(next.tabs).forEach((tab) => {
        if (tab.windowId === payload.windowId) {
          tab.isActive = false;
        }
      });
      next.tabs[payload.id] = {
        id: payload.id,
        windowId: payload.windowId,
        title: payload.title,
        url: payload.url,
        isActive: true,
        openedAt: payload.openedAt
      };
      const window = next.windows[payload.windowId];
      if (window) {
        window.tabOrder.push(payload.id);
      }
      next.history.push({
        id: `${payload.id}:${payload.openedAt}`,
        tabId: payload.id,
        title: payload.title,
        url: payload.url,
        visitedAt: payload.openedAt
      });
      break;
    }
    case "navigator/navigate": {
      const payload = event.payload as NavigatePayload;
      const tab = next.tabs[payload.tabId];
      if (tab) {
        tab.title = payload.title;
        tab.url = payload.url;
        next.history.push({
          id: `${payload.tabId}:${payload.visitedAt}`,
          tabId: payload.tabId,
          title: payload.title,
          url: payload.url,
          visitedAt: payload.visitedAt
        });
      }
      break;
    }
    case "navigator/activate_tab": {
      const payload = event.payload as { tabId: string };
      const current = next.tabs[payload.tabId];
      if (current) {
        Object.values(next.tabs).forEach((tab) => {
          if (tab.windowId === current.windowId) {
            tab.isActive = false;
          }
        });
        current.isActive = true;
        next.activeWindowId = current.windowId;
      }
      break;
    }
    case "navigator/bookmark": {
      const payload = event.payload as BookmarkPayload;
      next.bookmarks[payload.id] = payload;
      break;
    }
    case "navigator/download": {
      const payload = event.payload as DownloadPayload;
      next.downloads.push(payload);
      next.downloads = next.downloads.slice(-100);
      break;
    }
    default:
      break;
  }

  next.history = next.history.slice(-200);

  return {
    value: next,
    hash: canonicalHash(next),
    eventCount: state.eventCount + 1n
  };
};

export class NavigatorRuntime {
  private readonly dus: DUS<BrowserProfileState>;

  constructor(nodeId: string, profileId: string) {
    this.dus = new DUS(nodeId, navigatorReducer, {
      reducerVersion: "dus-navigator@1",
      initialValue: createInitialBrowserProfile(profileId)
    });
  }

  emit(type: string, payload: unknown, timestamp = Date.now()): Event {
    return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.profileId });
  }

  openWindow(payload: WindowPayload): Event {
    return this.emit("navigator/open_window", payload, payload.createdAt);
  }

  openTab(payload: TabPayload): Event {
    return this.emit("navigator/open_tab", payload, payload.openedAt);
  }

  navigate(payload: NavigatePayload): Event {
    return this.emit("navigator/navigate", payload, payload.visitedAt);
  }

  activateTab(tabId: string): Event {
    return this.emit("navigator/activate_tab", { tabId });
  }

  bookmark(payload: BookmarkPayload): Event {
    return this.emit("navigator/bookmark", payload, payload.savedAt);
  }

  download(payload: DownloadPayload): Event {
    return this.emit("navigator/download", payload, payload.startedAt);
  }

  getState(): BrowserProfileState {
    return this.dus.getState().value;
  }

  snapshot() {
    return this.dus.snapshot();
  }
}
