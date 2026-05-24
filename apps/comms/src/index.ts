import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4545);

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const target = path.join(publicDir, pathname);

  try {
    const content = await readFile(target);
    if (pathname.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    } else if (pathname.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
    }
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      app: "dus-comms",
      bootstrap: "manual-webrtc",
      centralizedServerRequired: false
    }));
    return;
  }

  await serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`DUS Communications app listening on http://${host}:${port}`);
  console.log("Bootstrap mode: manual WebRTC offer/answer exchange, no third-party signaling service required.");
});
