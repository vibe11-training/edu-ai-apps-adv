const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { OpenAI } = require("openai");

function failure(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function inRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateInput(type, input) {
  if ((type !== "quiz" && type !== "activity") || !input || typeof input !== "object" || Array.isArray(input)) {
    throw failure(400, "유효한 type과 input을 입력해 주세요.");
  }
  if (!["subject", "level", "topic", "goal"].every((key) => isText(input[key]))) {
    throw failure(400, "과목, 수준, 주제와 목표를 입력해 주세요.");
  }
  if (type === "quiz" && (!inRange(input.count, 1, 10) || !["쉬움", "보통", "어려움"].includes(input.difficulty))) {
    throw failure(400, "문항 수와 난이도를 확인해 주세요.");
  }
  if (type === "activity" && (
    !inRange(input.duration, 1, 180) ||
    !inRange(input.students, 1, 100) ||
    !inRange(input.groupSize, 2, 6) ||
    (input.conditions !== undefined && typeof input.conditions !== "string")
  )) {
    throw failure(400, "활동 시간, 학생 수, 모둠 인원과 운영 조건을 확인해 주세요.");
  }
}

module.exports = async function generate(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw failure(400, "유효한 type과 input을 입력해 주세요.");
  }
  const { type, input } = request;
  validateInput(type, input);
  const { AI_ENDPOINT, AI_API_KEY, AI_DEPLOYMENT } = process.env;
  if (!AI_ENDPOINT || !AI_API_KEY || !AI_DEPLOYMENT) {
    throw failure(503, "AI 연결 환경변수가 설정되지 않았습니다.");
  }

  const prompt = await readFile(join(__dirname, "..", "시스템 프롬프트.txt"), "utf8");
  const client = new OpenAI({
    baseURL: AI_ENDPOINT,
    apiKey: AI_API_KEY,
    maxRetries: 0,
    timeout: 60000,
  });
  let response;
  try {
    response = await client.chat.completions.create({
      model: AI_DEPLOYMENT,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `type: ${type}\n${JSON.stringify(input)}` },
      ],
    });
  } catch {
    throw failure(502, "AI 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  let data;
  try {
    data = JSON.parse(response.choices[0]?.message?.content);
  } catch {
    throw failure(502, "AI 응답이 올바른 JSON이 아닙니다.");
  }
  const { validate, validateActivities } = await import("./validate.js");
  const valid = type === "quiz" ? validate(data, input) : validateActivities(data, input);
  if (!valid) throw failure(502, "AI 응답이 검증을 통과하지 못했습니다.");
  return data;
};
