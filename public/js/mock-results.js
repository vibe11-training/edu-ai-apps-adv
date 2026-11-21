import { validate, validateActivities } from "../../api/validate.js";

export class ResultValidationError extends Error {}

export async function loadMockResults(kind, request, fetchData = fetch) {
  const isQuiz = kind === "quiz";
  if (!isQuiz && kind !== "activity") throw new Error("알 수 없는 결과 유형입니다.");

  const url = new URL(isQuiz ? "../../mock/quiz-questions.json" : "../../mock/activities.json", import.meta.url);
  const response = await fetchData(url);
  if (!response.ok) throw new Error(`예시 데이터를 불러오지 못했습니다. (HTTP ${response.status})`);
  const data = await response.json();
  const valid = isQuiz ? validate(data, request) : validateActivities(data, request);

  if (!valid) {
    if (isQuiz && Array.isArray(data) && request.count > data.length) {
      throw new ResultValidationError(`예시 문항이 ${data.length}개뿐이라 요청한 문항 수를 검증할 수 없습니다.`);
    }
    if (!isQuiz) {
      throw new ResultValidationError("활동 예시 데이터가 검증을 통과하지 못했습니다. 입력한 활동 시간과 예시 데이터를 확인해 주세요.");
    }
    throw new ResultValidationError("퀴즈 예시 데이터가 검증을 통과하지 못했습니다.");
  }
  return data;
}
