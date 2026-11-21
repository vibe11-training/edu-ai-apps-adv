import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import generate from "../api/generate.cjs";

const quizInput = {
  subject: "과학", level: "5학년", topic: "태양계", goal: "행성을 설명한다",
  count: 1, difficulty: "보통",
};
const activityInput = {
  subject: "과학", level: "5학년", topic: "태양계", goal: "행성을 설명한다",
  duration: 40, students: 24, groupSize: 4, conditions: "",
};
const quiz = [{
  question: "태양에 가장 가까운 행성은?", options: ["수성", "금성", "지구", "화성"],
  answer: "수성", explanation: "수성은 태양에 가장 가깝다.",
}];
const activities = Array.from({ length: 3 }, (_, index) => ({
  name: `활동 ${index}`, purpose: "목적", materials: "없음",
  steps: [{ description: "단계", minutes: 10 }], teacherGuidance: "안내",
  studentTask: `수행 ${index}`, assessmentMethod: "확인",
}));

test("Azure 요청에 유형과 입력을 전달하고 검증된 배열만 반환한다", async (t) => {
  const saved = {
    AI_ENDPOINT: process.env.AI_ENDPOINT,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_DEPLOYMENT: process.env.AI_DEPLOYMENT,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.AI_ENDPOINT = "https://example.invalid/openai/v1/";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_DEPLOYMENT = "test-deployment";
  let output = quiz;
  const calls = [];
  t.mock.method(globalThis, "fetch", async (request, options) => {
    calls.push({ url: String(request), body: JSON.parse(options.body), headers: new Headers(options.headers) });
    return new Response(JSON.stringify({
      id: "test", object: "chat.completion", created: 0, model: "test",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.deepEqual(await generate({ type: "quiz", input: quizInput }), quiz);
  assert.equal(calls[0].url, "https://example.invalid/openai/v1/chat/completions");
  assert.equal(calls[0].headers.get("authorization"), "Bearer test-key");
  assert.equal(calls[0].body.model, "test-deployment");
  assert.equal(calls[0].body.messages[1].content, `type: quiz\n${JSON.stringify(quizInput)}`);
  assert.match(calls[0].body.messages[0].content, /teacherGuidance/);

  output = activities;
  assert.deepEqual(await generate({ type: "activity", input: activityInput }), activities);
  assert.equal(calls[1].body.messages[1].content, `type: activity\n${JSON.stringify(activityInput)}`);

  output = [{ ...quiz[0], answer: "보기 밖" }];
  await assert.rejects(generate({ type: "quiz", input: quizInput }), (error) => error.status === 502);
  output = [...quiz, { ...quiz[0], answer: "보기 밖" }];
  await assert.rejects(generate({ type: "quiz", input: quizInput }), (error) => error.status === 502);
  output = activities;
  await assert.rejects(generate({ type: "activity", input: { ...activityInput, duration: 1 } }), (error) => error.status === 502);
});

test("잘못된 입력이나 미설정 환경변수는 AI 호출 전에 거부한다", async (t) => {
  const saved = process.env.AI_ENDPOINT;
  t.after(() => {
    if (saved === undefined) delete process.env.AI_ENDPOINT;
    else process.env.AI_ENDPOINT = saved;
  });
  delete process.env.AI_ENDPOINT;
  const fetchMock = t.mock.method(globalThis, "fetch", () => { throw new Error("호출되면 안 됩니다"); });
  await assert.rejects(generate(null), (error) => error.status === 400);
  await assert.rejects(generate({ type: "quiz", input: { ...quizInput, count: 0 } }), (error) => error.status === 400);
  await assert.rejects(generate({ type: "quiz", input: quizInput }), (error) => error.status === 503);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("HTTP 서버에서 생성 API를 연결하고 기존 화면을 제공한다", async (t) => {
  let upstreamBody;
  let upstreamPath;
  const upstream = createServer(async (req, res) => {
    upstreamPath = req.url;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    upstreamBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: "test", object: "chat.completion", created: 0, model: "test",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(quiz) }, finish_reason: "stop" }],
    }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      AI_ENDPOINT: `http://127.0.0.1:${upstream.address().port}/openai/v1/`,
      AI_API_KEY: "test-key",
      AI_DEPLOYMENT: "test-deployment",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(([code]) => { throw new Error(`서버가 시작되지 않았습니다: ${code}`); }),
  ]);
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/quiz.html`)).status, 200);
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "quiz", input: quizInput }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), quiz);
  assert.equal(upstreamPath, "/openai/v1/chat/completions");
  assert.equal(upstreamBody.messages[1].content, `type: quiz\n${JSON.stringify(quizInput)}`);
});
