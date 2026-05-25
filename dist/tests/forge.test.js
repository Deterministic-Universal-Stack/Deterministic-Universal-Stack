import { describe, expect, it } from "vitest";
import { ForgeRuntime } from "@dus/forge";
describe("dus forge", () => {
    it("tracks repositories, branches, commits, and pull requests deterministically", () => {
        const forge = new ForgeRuntime("node", "repo-1", "Repo One", "Test repo");
        forge.createRepository({
            repositoryId: "repo-1",
            name: "Repo One",
            description: "Test repo",
            ownerId: "james",
            ownerName: "James",
            createdAt: 1
        });
        forge.createBranch({
            name: "feature/docs",
            createdBy: "james",
            createdAt: 2
        });
        forge.commit({
            commitId: "c1",
            branchName: "feature/docs",
            message: "Add docs",
            files: [{ path: "README.md", content: "# Hello" }],
            authoredBy: "james",
            authoredAt: 3
        });
        forge.openPullRequest({
            id: "pr-1",
            title: "Docs",
            sourceBranch: "feature/docs",
            targetBranch: "main",
            createdBy: "james",
            createdAt: 4
        });
        const state = forge.getState();
        expect(state.branches["feature/docs"].headCommitId).toBe("c1");
        expect(state.pullRequests["pr-1"].status).toBe("open");
        expect(Object.keys(state.commits)).toHaveLength(1);
    });
});
//# sourceMappingURL=forge.test.js.map