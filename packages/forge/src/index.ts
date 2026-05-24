import { DUS, canonicalHash, type Event, type Reducer } from "@dus/core";

export interface ForgeFile {
  path: string;
  content: string;
}

export interface ForgeCommit {
  commitId: string;
  branchName: string;
  message: string;
  fileCount: number;
  fileHash: string;
  authoredBy: string;
  authoredAt: number;
}

export interface ForgeBranch {
  name: string;
  headCommitId?: string;
  createdBy: string;
  createdAt: number;
}

export interface ForgePullRequest {
  id: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: "open" | "merged" | "closed";
  createdBy: string;
  createdAt: number;
  mergedAt?: number;
}

export interface ForgeReview {
  id: string;
  pullRequestId: string;
  reviewerId: string;
  verdict: "approve" | "request_changes" | "comment";
  body: string;
  createdAt: number;
}

export interface ForgeComment {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: number;
}

export interface ForgeRepositoryState {
  repositoryId: string;
  name: string;
  description: string;
  branches: Record<string, ForgeBranch>;
  workingTree: Record<string, ForgeFile>;
  commits: Record<string, ForgeCommit>;
  pullRequests: Record<string, ForgePullRequest>;
  reviews: Record<string, ForgeReview[]>;
  discussions: Record<string, ForgeComment[]>;
  collaborators: Record<string, { displayName: string; role: "owner" | "maintainer" | "collaborator" }>;
}

export function createInitialForgeState(repositoryId: string, name: string, description: string): ForgeRepositoryState {
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

export type CreateRepositoryPayload = {
  repositoryId: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  createdAt: number;
};

export type AddCollaboratorPayload = {
  userId: string;
  displayName: string;
  role: "owner" | "maintainer" | "collaborator";
};

export type BranchPayload = {
  name: string;
  createdBy: string;
  createdAt: number;
  headCommitId?: string;
};

export type FilePayload = {
  path: string;
  content: string;
};

export type CommitPayload = {
  commitId: string;
  branchName: string;
  message: string;
  files: ForgeFile[];
  authoredBy: string;
  authoredAt: number;
};

export type PullRequestPayload = {
  id: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  createdBy: string;
  createdAt: number;
};

export type ReviewPayload = {
  id: string;
  pullRequestId: string;
  reviewerId: string;
  verdict: "approve" | "request_changes" | "comment";
  body: string;
  createdAt: number;
};

export type DiscussionPayload = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: number;
};

export const forgeReducer: Reducer<ForgeRepositoryState> = (state, event) => {
  const next: ForgeRepositoryState = {
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
      const payload = event.payload as CreateRepositoryPayload;
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
      const payload = event.payload as AddCollaboratorPayload;
      next.collaborators[payload.userId] = {
        displayName: payload.displayName,
        role: payload.role
      };
      break;
    }
    case "forge/create_branch": {
      const payload = event.payload as BranchPayload;
      next.branches[payload.name] = {
        name: payload.name,
        createdBy: payload.createdBy,
        createdAt: payload.createdAt,
        headCommitId: payload.headCommitId
      };
      break;
    }
    case "forge/set_file": {
      const payload = event.payload as FilePayload;
      next.workingTree[payload.path] = {
        path: payload.path,
        content: payload.content
      };
      break;
    }
    case "forge/create_commit": {
      const payload = event.payload as CommitPayload;
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
      const payload = event.payload as PullRequestPayload;
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
      const payload = event.payload as ReviewPayload;
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
      const payload = event.payload as { id: string; mergedAt: number };
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
      const payload = event.payload as DiscussionPayload;
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
  private readonly dus: DUS<ForgeRepositoryState>;

  constructor(nodeId: string, repositoryId: string, name = "Unnamed Repo", description = "") {
    this.dus = new DUS(nodeId, forgeReducer, {
      reducerVersion: "dus-forge@1",
      initialValue: createInitialForgeState(repositoryId, name, description)
    });
  }

  emit(type: string, payload: unknown, timestamp = Date.now()): Event {
    return this.dus.emit(type, payload, { timestamp, sessionId: this.dus.getState().value.repositoryId });
  }

  createRepository(payload: CreateRepositoryPayload): Event {
    return this.emit("forge/create_repository", payload, payload.createdAt);
  }

  createBranch(payload: BranchPayload): Event {
    return this.emit("forge/create_branch", payload, payload.createdAt);
  }

  setFile(path: string, content: string): Event {
    return this.emit("forge/set_file", { path, content });
  }

  commit(payload: CommitPayload): Event {
    return this.emit("forge/create_commit", payload, payload.authoredAt);
  }

  openPullRequest(payload: PullRequestPayload): Event {
    return this.emit("forge/open_pull_request", payload, payload.createdAt);
  }

  reviewPullRequest(payload: ReviewPayload): Event {
    return this.emit("forge/review_pull_request", payload, payload.createdAt);
  }

  mergePullRequest(id: string, mergedAt = Date.now()): Event {
    return this.emit("forge/merge_pull_request", { id, mergedAt }, mergedAt);
  }

  comment(payload: DiscussionPayload): Event {
    return this.emit("forge/comment", payload, payload.createdAt);
  }

  getState(): ForgeRepositoryState {
    return this.dus.getState().value;
  }

  snapshot() {
    return this.dus.snapshot();
  }
}
