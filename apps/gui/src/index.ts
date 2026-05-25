import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeSystemCapabilities } from "@dus/capabilities";
import { runProofSuite, simulateHistory } from "@dus/proof-harness";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4141);

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveFile(res: http.ServerResponse, requestPath: string): Promise<void> {
  const target = path.resolve(publicDir, decodeURIComponent(requestPath).replace(/^\/+/, ""));
  const relative = path.relative(publicDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }
  try {
    const content = await readFile(target);
    res.writeHead(200, { "Content-Type": contentType(target) });
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
  if (req.method === "GET" && url.pathname === "/api/apps") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(describeSystemCapabilities()));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/proof") {
    const histories = Number(url.searchParams.get("histories") ?? 250);
    const report = runProofSuite({ histories, replicas: 3, eventsPerReplica: 8 });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(report));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/history") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(simulateHistory(424242, 3, 8, 0)));
    return;
  }

  await serveFile(res, url.pathname === "/" ? "/index.html" : url.pathname);
});

server.listen(port, host, () => {
  console.log(`DUS proof GUI listening on http://${host}:${port}`);
  console.log("Replay inspector: /replay.html");
});
