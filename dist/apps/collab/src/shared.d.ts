import { type Reducer } from "@dus/core";
export interface Collaborator {
    userId: string;
    displayName: string;
    joinedAt: number;
    color: string;
    isOnline: boolean;
}
export interface ChatMessage {
    id: string;
    userId: string;
    displayName: string;
    body: string;
    timestamp: number;
}
export interface WitnessEntry {
    id: string;
    userId: string;
    mode: "chat" | "suggest";
    prompt: string;
    response: string;
    extractedHtml?: string;
    timestamp: number;
}
export interface CollaborationState {
    roomId: string;
    html: string;
    title: string;
    githubSource?: string;
    lastEditedBy?: string;
    lastEditedAt?: number;
    collaborators: Record<string, Collaborator>;
    chat: ChatMessage[];
    witnessLog: WitnessEntry[];
}
export interface JoinPayload {
    userId: string;
    displayName: string;
    color: string;
    joinedAt: number;
}
export interface LeavePayload {
    userId: string;
}
export interface HtmlUpdatePayload {
    userId: string;
    displayName: string;
    html: string;
    title: string;
    githubSource?: string;
    editedAt: number;
}
export interface ChatPayload {
    id: string;
    userId: string;
    displayName: string;
    body: string;
    timestamp: number;
}
export interface WitnessPayload extends WitnessEntry {
}
export declare function defaultHtml(roomId: string): string;
export declare function createInitialCollaborationState(roomId: string): CollaborationState;
export declare const collaborationReducer: Reducer<CollaborationState>;
export declare function summarizeWitnessContext(state: CollaborationState): string;
export declare function extractHtmlBlock(text: string): string | undefined;
export declare function normalizeGitHubContentUrl(input: string): string;
//# sourceMappingURL=shared.d.ts.map