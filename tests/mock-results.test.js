import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadMockResults, ResultValidationError } from "../public/js/mock-results.js";

const quiz = JSON.parse(await readFile(new URL("../mock/quiz-questions.json", import.meta.url), "utf8"));
const activities = JSON.parse(await readFile(new URL("../mock/activities.json", import.meta.url), "utf8"));
const fetchData = (data) => async () => ({ ok: true, json: async () => data });

test("퀴즈 응답은 요청한 문항 수와 정확히 일치해야 한다", async () => {
  const result = await loadMockResults("quiz", { count: 3 }, fetchData(quiz.slice(0, 3)));
  assert.deepEqual(result, quiz.slice(0, 3));
  await assert.rejects(loadMockResults("quiz", { count: 3 }, fetchData(quiz)), ResultValidationError);
  await assert.rejects(loadMockResults("quiz", { count: 6 }, fetchData(quiz)), ResultValidationError);
});

test("초과 문항이 유효하지 않아도 잘라내지 않고 전체 응답을 거부한다", async () => {
  const extraInvalid = [...quiz.slice(0, 3), { ...quiz[3], answer: "보기 밖 정답" }];
  await assert.rejects(loadMockResults("quiz", { count: 3 }, fetchData(extraInvalid)), ResultValidationError);
});

test("정답이 보기 밖인 퀴즈 예시는 반환하지 않는다", async () => {
  const invalid = [{ ...quiz[0], answer: "보기 밖 정답" }];
  await assert.rejects(loadMockResults("quiz", { count: 1 }, fetchData(invalid)), ResultValidationError);
});

test("활동 예시는 입력 시간에 맞을 때만 세 활동을 반환한다", async () => {
  assert.deepEqual(await loadMockResults("activity", { duration: 40 }, fetchData(activities)), activities);
  await assert.rejects(loadMockResults("activity", { duration: 39 }, fetchData(activities)), ResultValidationError);
});

test("필수 항목이 없거나 단계 시간이 잘못된 활동 예시는 반환하지 않는다", async () => {
  const invalid = structuredClone(activities);
  invalid[0].steps[0].minutes = 0;
  await assert.rejects(loadMockResults("activity", { duration: 45 }, fetchData(invalid)), ResultValidationError);
});

test("데이터 로딩 오류는 검증 성공 결과로 처리하지 않는다", async () => {
  await assert.rejects(loadMockResults("quiz", { count: 1 }, async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(loadMockResults("activity", { duration: 45 }, async () => ({
    ok: true,
    json: async () => { throw new SyntaxError("invalid JSON"); },
  })), SyntaxError);
});
