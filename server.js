import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import generate from "./api/generate.cjs";

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(root, "public");
const sharedFiles = new Map([
  ["/api/validate.js", resolve(root, "api", "validate.js")],
  ["/mock/quiz-questions.json", resolve(root, "mock", "quiz-questions.json")],
  ["/mock/activities.json", resolve(root, "mock", "activities.json")],
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  if (req.url === "/api/generate") {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) {
        res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: "요청 크기가 너무 큽니다." }));
        return;
      }
      chunks.push(chunk);
    }
    let request;
    try {
      request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ error: "요청이 올바른 JSON이 아닙니다." }));
      return;
    }
    try {
      const result = await generate(request);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error("생성 처리 중 서버 오류가 발생했습니다.", error.name);
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ error: status === 500 ? "서버 오류가 발생했습니다." : error.message }));
    }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("잘못된 요청입니다.");
    return;
  }
  const file = sharedFiles.get(pathname) || resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!sharedFiles.has(pathname) && !file.startsWith(publicRoot + sep)) {
    res.writeHead(403).end("접근할 수 없습니다.");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      res.writeHead(404).end("파일을 찾을 수 없습니다.");
    } else {
      console.error("파일을 읽지 못했습니다.", error);
      res.writeHead(500).end("서버 오류가 발생했습니다.");
    }
  }
}).listen(process.env.PORT || 3000, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${process.env.PORT || 3000}`);
});
