import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DUS, stringifyWithBigInt } from "@dus/core";
import { WebSocketServer } from "ws";
import { collaborationReducer, createInitialCollaborationState, extractHtmlBlock, summarizeWitnessContext } from "./shared.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "0.0.0.0";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2";
const rooms = new Map();
function getRoom(roomId) {
    const existing = rooms.get(roomId);
    if (existing) {
        return existing;
    }
    const room = new DUS(`room:${roomId}`, collaborationReducer, {
        reducerVersion: "dus-collab-room@1",
        initialValue: createInitialCollaborationState(roomId)
    });
    const context = {
        roomId,
        dus: room,
        sessions: new Set()
    };
    rooms.set(roomId, context);
    return context;
}
function sendJson(socket, payload) {
    if (socket.readyState === socket.OPEN) {
        socket.send(stringifyWithBigInt(payload));
    }
}
function roomPayload(room) {
    return {
        type: "room/state",
        snapshot: room.dus.snapshot(),
        state: room.dus.getState().value,
        verification: room.dus.verify()
    };
}
function broadcastRoom(room) {
    const payload = roomPayload(room);
    for (const session of room.sessions) {
        sendJson(session.socket, payload);
    }
}
async function serveStatic(req, res) {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const target = path.join(publicDir, pathname);
    try {
        const content = await readFile(target);
        if (pathname.endsWith(".css")) {
            res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
        else if (pathname.endsWith(".js")) {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        }
        else {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
        }
        res.writeHead(200);
        res.end(content);
    }
    catch {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Not found" }));
    }
}
async function handleGitHubImport(req, res) {
    const body = await readJsonBody(req);
    const roomId = typeof body.roomId === "string" ? body.roomId : "lobby";
    const userId = typeof body.userId === "string" ? body.userId : "github-import";
    const displayName = typeof body.displayName === "string" ? body.displayName : "GitHub Import";
    const sourceUrl = typeof body.url === "string" ? body.url : "";
    try {
        const { normalizeGitHubContentUrl } = await import("./shared.js");
        const normalizedUrl = normalizeGitHubContentUrl(sourceUrl);
        const response = await fetch(normalizedUrl);
        if (!response.ok) {
            throw new Error(`GitHub fetch failed with status ${response.status}.`);
        }
        const html = await response.text();
        const title = sourceUrl.split("/").filter(Boolean).pop() ?? "Imported HTML";
        const room = getRoom(roomId);
        room.dus.emit("doc/set_html", {
            userId,
            displayName,
            html,
            title,
            githubSource: sourceUrl,
            editedAt: Date.now()
        }, {
            sessionId: roomId
        });
        broadcastRoom(room);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            ok: true,
            title,
            githubSource: sourceUrl,
            normalizedUrl,
            stateHash: room.dus.getState().hash
        }));
    }
    catch (error) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        }));
    }
}
async function handleWitness(req, res) {
    const body = await readJsonBody(req);
    const roomId = typeof body.roomId === "string" ? body.roomId : "lobby";
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const userId = typeof body.userId === "string" ? body.userId : "anonymous";
    const mode = body.mode === "suggest" ? "suggest" : "chat";
    const room = getRoom(roomId);
    const state = room.dus.getState().value;
    const systemPrompt = [
        "You are the DUS Witness for a collaborative HTML room.",
        "You must respect these system laws:",
        "1. State is derived from immutable events.",
        "2. Suggestions must be deterministic, explicit, and grounded in the current shared state.",
        "3. Do not invent hidden server behavior, secret storage, or out-of-band coordination.",
        "4. Only propose edits that fit inside a single collaborative HTML document unless the user explicitly asks otherwise.",
        "5. If you suggest code changes, prefer returning a complete ```html fenced block when practical.",
        "6. Explain your reasoning in human terms and keep it collaborative.",
        "",
        "Current collaborative state follows."
    ].join("\n");
    const witnessContext = summarizeWitnessContext(state);
    try {
        const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: ollamaModel,
                stream: false,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `${witnessContext}\n\nUser request:\n${prompt}` }
                ]
            })
        });
        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText}`);
        }
        const payload = await ollamaResponse.json();
        const responseText = payload.message?.content?.trim() ?? "No response from Ollama.";
        const extractedHtml = extractHtmlBlock(responseText);
        const witnessRecord = {
            id: randomUUID(),
            userId,
            mode,
            prompt,
            response: responseText,
            extractedHtml,
            timestamp: Date.now()
        };
        room.dus.emit("witness/record", witnessRecord, {
            sessionId: roomId
        });
        broadcastRoom(room);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            ok: true,
            witness: witnessRecord,
            stateHash: room.dus.getState().hash
        }));
    }
    catch (error) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            ollamaBaseUrl,
            ollamaModel
        }));
    }
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => {
            data += chunk;
        });
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            }
            catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}
const server = http.createServer(async (req, res) => {
    if (!req.url) {
        res.writeHead(400).end();
        return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
        return;
    }
    if (req.method === "POST" && url.pathname === "/api/ollama/witness") {
        await handleWitness(req, res);
        return;
    }
    if (req.method === "POST" && url.pathname === "/api/github/import") {
        await handleGitHubImport(req, res);
        return;
    }
    if (req.method === "GET" && url.pathname === "/api/rooms") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(stringifyWithBigInt({
            rooms: [...rooms.values()].map((room) => ({
                roomId: room.roomId,
                stateHash: room.dus.getState().hash,
                eventCount: room.dus.getState().eventCount,
                online: room.sessions.size
            }))
        }));
        return;
    }
    await serveStatic(req, res);
});
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, request) => {
    const requestUrl = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "localhost"}`);
    const roomId = requestUrl.searchParams.get("room") ?? "lobby";
    const userId = requestUrl.searchParams.get("userId") ?? randomUUID();
    const displayName = requestUrl.searchParams.get("name") ?? "Anonymous";
    const color = requestUrl.searchParams.get("color") ?? "#b55d32";
    const room = getRoom(roomId);
    const session = { socket, roomId, userId, displayName, color };
    room.sessions.add(session);
    room.dus.emit("collab/join", {
        userId,
        displayName,
        color,
        joinedAt: Date.now()
    }, {
        sessionId: roomId
    });
    broadcastRoom(room);
    socket.on("message", (raw) => {
        try {
            const message = JSON.parse(raw.toString());
            if (message.type === "doc/set_html") {
                room.dus.emit("doc/set_html", {
                    userId,
                    displayName,
                    html: String(message.payload?.html ?? ""),
                    title: String(message.payload?.title ?? "Untitled"),
                    githubSource: typeof message.payload?.githubSource === "string" ? String(message.payload?.githubSource) : room.dus.getState().value.githubSource,
                    editedAt: Number(message.payload?.editedAt ?? Date.now())
                }, {
                    sessionId: roomId
                });
                broadcastRoom(room);
            }
            if (message.type === "chat/post") {
                room.dus.emit("chat/post", {
                    id: randomUUID(),
                    userId,
                    displayName,
                    body: String(message.payload?.body ?? ""),
                    timestamp: Date.now()
                }, {
                    sessionId: roomId
                });
                broadcastRoom(room);
            }
            if (message.type === "witness/apply_html") {
                room.dus.emit("doc/set_html", {
                    userId,
                    displayName,
                    html: String(message.payload?.html ?? ""),
                    title: String(message.payload?.title ?? room.dus.getState().value.title),
                    githubSource: room.dus.getState().value.githubSource,
                    editedAt: Date.now()
                }, {
                    sessionId: roomId
                });
                broadcastRoom(room);
            }
        }
        catch (error) {
            sendJson(socket, {
                type: "room/error",
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });
    socket.on("close", () => {
        room.sessions.delete(session);
        room.dus.emit("collab/leave", { userId }, { sessionId: roomId });
        broadcastRoom(room);
    });
    sendJson(socket, roomPayload(room));
});
server.listen(port, host, () => {
    console.log(`DUS Collaborative HTML app listening on http://${host}:${port}`);
    console.log(`Ollama witness target: ${ollamaBaseUrl} using model ${ollamaModel}`);
});
//# sourceMappingURL=index.js.map