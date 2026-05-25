import { stringifyWithBigInt } from "@dus/core";
import { ForgeRuntime } from "@dus/forge";
const forge = new ForgeRuntime("forge-node", "dus-platform", "Deterministic Universal Stack", "A DUS-native forge.");
forge.createRepository({
    repositoryId: "dus-platform",
    name: "Deterministic Universal Stack",
    description: "Alternative internet substrate.",
    ownerId: "james",
    ownerName: "James Chapman",
    createdAt: 1
});
forge.createBranch({
    name: "feature/collab-room",
    createdBy: "james",
    createdAt: 2,
    headCommitId: forge.getState().branches.main.headCommitId
});
forge.commit({
    commitId: "commit-1",
    branchName: "feature/collab-room",
    message: "Add collaborative HTML room",
    files: [
        { path: "apps/collab/index.html", content: "<html><body>Hello DUS</body></html>" },
        { path: "README.md", content: "# DUS Forge" }
    ],
    authoredBy: "james",
    authoredAt: 3
});
forge.openPullRequest({
    id: "pr-1",
    title: "Collaborative HTML wedge app",
    sourceBranch: "feature/collab-room",
    targetBranch: "main",
    createdBy: "james",
    createdAt: 4
});
forge.reviewPullRequest({
    id: "review-1",
    pullRequestId: "pr-1",
    reviewerId: "witness",
    verdict: "approve",
    body: "Deterministic replay looks sound.",
    createdAt: 5
});
console.log(stringifyWithBigInt(forge.snapshot(), 2));
//# sourceMappingURL=index.js.map