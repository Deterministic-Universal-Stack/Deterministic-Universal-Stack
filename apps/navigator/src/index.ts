import { stringifyWithBigInt } from "@dus/core";
import { NavigatorRuntime } from "@dus/navigator";

const navigator = new NavigatorRuntime("navigator-node", "james-browser");

navigator.openWindow({
  id: "window-1",
  title: "James Browser",
  createdAt: 1
});

navigator.openTab({
  id: "tab-1",
  windowId: "window-1",
  title: "DUS Home",
  url: "dus://home",
  openedAt: 2
});

navigator.openTab({
  id: "tab-2",
  windowId: "window-1",
  title: "Forge",
  url: "dus://forge/dus-platform",
  openedAt: 3
});

navigator.navigate({
  tabId: "tab-2",
  title: "PR #1",
  url: "dus://forge/dus-platform/pull/pr-1",
  visitedAt: 4
});

navigator.bookmark({
  id: "bookmark-1",
  title: "DUS Collab",
  url: "dus://collab/hello-room",
  savedAt: 5
});

navigator.download({
  id: "download-1",
  title: "room-export.html",
  url: "dus://downloads/room-export.html",
  startedAt: 6
});

console.log(stringifyWithBigInt(navigator.snapshot(), 2));
