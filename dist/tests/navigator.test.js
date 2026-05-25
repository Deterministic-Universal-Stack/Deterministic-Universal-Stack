import { describe, expect, it } from "vitest";
import { NavigatorRuntime } from "@dus/navigator";
describe("dus navigator", () => {
    it("tracks windows, tabs, bookmarks, and history deterministically", () => {
        const navigator = new NavigatorRuntime("node", "profile-1");
        navigator.openWindow({
            id: "w1",
            title: "Main",
            createdAt: 1
        });
        navigator.openTab({
            id: "t1",
            windowId: "w1",
            title: "Home",
            url: "dus://home",
            openedAt: 2
        });
        navigator.navigate({
            tabId: "t1",
            title: "Forge",
            url: "dus://forge/repo",
            visitedAt: 3
        });
        navigator.bookmark({
            id: "b1",
            title: "Forge",
            url: "dus://forge/repo",
            savedAt: 4
        });
        const state = navigator.getState();
        expect(state.windows.w1.tabOrder).toEqual(["t1"]);
        expect(state.tabs.t1.url).toBe("dus://forge/repo");
        expect(state.history).toHaveLength(2);
        expect(state.bookmarks.b1.title).toBe("Forge");
    });
});
//# sourceMappingURL=navigator.test.js.map