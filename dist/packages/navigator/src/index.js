import { DUS, canonicalHash } from "@dus/core";
export function createInitialBrowserProfile(profileId) {
    return {
        profileId,
        windows: {},
        tabs: {},
        bookmarks: {},
        history: [],
        downloads: []
    };
}
export const navigatorReducer = (state, event) => {
    const next = {
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
            const payload = event.payload;
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
            const payload = event.payload;
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
            const payload = event.payload;
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
            const payload = event.payload;
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
            const payload = event.payload;
            next.bookmarks[payload.id] = payload;
            break;
        }
        case "navigator/download": {
            const payload = event.payload;
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
    dus;
    constructor(nodeId, profileId) {
        this.dus = new DUS(nodeId, navigatorReducer, {
            reducerVersion: "dus-navigator@1",
            initialValue: createInitialBrowserProfile(profileId)
        });
    }
    emit(type, payload, timestamp = Date.now()) {
        return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.profileId });
    }
    openWindow(payload) {
        return this.emit("navigator/open_window", payload, payload.createdAt);
    }
    openTab(payload) {
        return this.emit("navigator/open_tab", payload, payload.openedAt);
    }
    navigate(payload) {
        return this.emit("navigator/navigate", payload, payload.visitedAt);
    }
    activateTab(tabId) {
        return this.emit("navigator/activate_tab", { tabId });
    }
    bookmark(payload) {
        return this.emit("navigator/bookmark", payload, payload.savedAt);
    }
    download(payload) {
        return this.emit("navigator/download", payload, payload.startedAt);
    }
    getState() {
        return this.dus.getState().value;
    }
    snapshot() {
        return this.dus.snapshot();
    }
}
//# sourceMappingURL=index.js.map