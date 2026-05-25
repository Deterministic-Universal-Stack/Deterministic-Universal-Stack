import { type Event, type Reducer } from "@dus/core";
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
    collaborators: Record<string, {
        displayName: string;
        role: "owner" | "maintainer" | "collaborator";
    }>;
}
export declare function createInitialForgeState(repositoryId: string, name: string, description: string): ForgeRepositoryState;
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
export declare const forgeReducer: Reducer<ForgeRepositoryState>;
export declare class ForgeRuntime {
    private readonly dus;
    constructor(nodeId: string, repositoryId: string, name?: string, description?: string);
    emit(type: string, payload: unknown, timestamp?: number): Event;
    createRepository(payload: CreateRepositoryPayload): Event;
    createBranch(payload: BranchPayload): Event;
    setFile(path: string, content: string): Event;
    commit(payload: CommitPayload): Event;
    openPullRequest(payload: PullRequestPayload): Event;
    reviewPullRequest(payload: ReviewPayload): Event;
    mergePullRequest(id: string, mergedAt?: number): Event;
    comment(payload: DiscussionPayload): Event;
    getState(): ForgeRepositoryState;
    snapshot(): import("@dus/core").Snapshot<ForgeRepositoryState>;
}
//# sourceMappingURL=index.d.ts.map