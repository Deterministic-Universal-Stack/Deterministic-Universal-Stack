import { type Event, type Reducer } from "@dus/core";
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
    downloads: Array<{
        id: string;
        title: string;
        url: string;
        startedAt: number;
    }>;
    activeWindowId?: string;
}
export declare function createInitialBrowserProfile(profileId: string): BrowserProfileState;
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
export declare const navigatorReducer: Reducer<BrowserProfileState>;
export declare class NavigatorRuntime {
    private readonly dus;
    constructor(nodeId: string, profileId: string);
    emit(type: string, payload: unknown, timestamp?: number): Event;
    openWindow(payload: WindowPayload): Event;
    openTab(payload: TabPayload): Event;
    navigate(payload: NavigatePayload): Event;
    activateTab(tabId: string): Event;
    bookmark(payload: BookmarkPayload): Event;
    download(payload: DownloadPayload): Event;
    getState(): BrowserProfileState;
    snapshot(): import("@dus/core").Snapshot<BrowserProfileState>;
}
export {};
//# sourceMappingURL=index.d.ts.map