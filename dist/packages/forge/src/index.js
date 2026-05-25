import { DUS, canonicalHash } from "@dus/core";
export function createInitialForgeState(repositoryId, name, description) {
    return {
        repositoryId,
        name,
        description,
        branches: {},
        workingTree: {},
        commits: {},
        pullRequests: {},
        reviews: {},
        discussions: {},
        collaborators: {}
    };
}
export const forgeReducer = (state, event) => {
    const next = {
        repositoryId: state.value.repositoryId,
        name: state.value.name,
        description: state.value.description,
        branches: { ...state.value.branches },
        workingTree: { ...state.value.workingTree },
        commits: { ...state.value.commits },
        pullRequests: { ...state.value.pullRequests },
        reviews: Object.fromEntries(Object.entries(state.value.reviews).map(([key, value]) => [key, [...value]])),
        discussions: Object.fromEntries(Object.entries(state.value.discussions).map(([key, value]) => [key, [...value]])),
        collaborators: { ...state.value.collaborators }
    };
    switch (event.type) {
        case "forge/create_repository": {
            const payload = event.payload;
            next.repositoryId = payload.repositoryId;
            next.name = payload.name;
            next.description = payload.description;
            next.collaborators[payload.ownerId] = {
                displayName: payload.ownerName,
                role: "owner"
            };
            next.branches.main = {
                name: "main",
                createdBy: payload.ownerId,
                createdAt: payload.createdAt
            };
            break;
        }
        case "forge/add_collaborator": {
            const payload = event.payload;
            next.collaborators[payload.userId] = {
                displayName: payload.displayName,
                role: payload.role
            };
            break;
        }
        case "forge/create_branch": {
            const payload = event.payload;
            next.branches[payload.name] = {
                name: payload.name,
                createdBy: payload.createdBy,
                createdAt: payload.createdAt,
                headCommitId: payload.headCommitId
            };
            break;
        }
        case "forge/set_file": {
            const payload = event.payload;
            next.workingTree[payload.path] = {
                path: payload.path,
                content: payload.content
            };
            break;
        }
        case "forge/create_commit": {
            const payload = event.payload;
            for (const file of payload.files) {
                next.workingTree[file.path] = file;
            }
            const fileHash = canonicalHash(payload.files);
            next.commits[payload.commitId] = {
                commitId: payload.commitId,
                branchName: payload.branchName,
                message: payload.message,
                fileCount: payload.files.length,
                fileHash,
                authoredBy: payload.authoredBy,
                authoredAt: payload.authoredAt
            };
            const branch = next.branches[payload.branchName];
            if (branch) {
                next.branches[payload.branchName] = {
                    ...branch,
                    headCommitId: payload.commitId
                };
            }
            break;
        }
        case "forge/open_pull_request": {
            const payload = event.payload;
            next.pullRequests[payload.id] = {
                id: payload.id,
                title: payload.title,
                sourceBranch: payload.sourceBranch,
                targetBranch: payload.targetBranch,
                status: "open",
                createdBy: payload.createdBy,
                createdAt: payload.createdAt
            };
            break;
        }
        case "forge/review_pull_request": {
            const payload = event.payload;
            const existing = next.reviews[payload.pullRequestId] ?? [];
            existing.push({
                id: payload.id,
                pullRequestId: payload.pullRequestId,
                reviewerId: payload.reviewerId,
                verdict: payload.verdict,
                body: payload.body,
                createdAt: payload.createdAt
            });
            next.reviews[payload.pullRequestId] = existing;
            break;
        }
        case "forge/merge_pull_request": {
            const payload = event.payload;
            const pr = next.pullRequests[payload.id];
            if (pr) {
                next.pullRequests[payload.id] = {
                    ...pr,
                    status: "merged",
                    mergedAt: payload.mergedAt
                };
            }
            break;
        }
        case "forge/comment": {
            const payload = event.payload;
            const existing = next.discussions[payload.threadId] ?? [];
            existing.push({
                id: payload.id,
                threadId: payload.threadId,
                authorId: payload.authorId,
                body: payload.body,
                createdAt: payload.createdAt
            });
            next.discussions[payload.threadId] = existing;
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
export class ForgeRuntime {
    dus;
    constructor(nodeId, repositoryId, name = "Unnamed Repo", description = "") {
        this.dus = new DUS(nodeId, forgeReducer, {
            reducerVersion: "dus-forge@1",
            initialValue: createInitialForgeState(repositoryId, name, description)
        });
    }
    emit(type, payload, timestamp = Date.now()) {
        return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.repositoryId });
    }
    createRepository(payload) {
        return this.emit("forge/create_repository", payload, payload.createdAt);
    }
    createBranch(payload) {
        return this.emit("forge/create_branch", payload, payload.createdAt);
    }
    setFile(path, content) {
        return this.emit("forge/set_file", { path, content });
    }
    commit(payload) {
        return this.emit("forge/create_commit", payload, payload.authoredAt);
    }
    openPullRequest(payload) {
        return this.emit("forge/open_pull_request", payload, payload.createdAt);
    }
    reviewPullRequest(payload) {
        return this.emit("forge/review_pull_request", payload, payload.createdAt);
    }
    mergePullRequest(id, mergedAt = Date.now()) {
        return this.emit("forge/merge_pull_request", { id, mergedAt }, mergedAt);
    }
    comment(payload) {
        return this.emit("forge/comment", payload, payload.createdAt);
    }
    getState() {
        return this.dus.getState().value;
    }
    snapshot() {
        return this.dus.snapshot();
    }
}
//# sourceMappingURL=index.js.map