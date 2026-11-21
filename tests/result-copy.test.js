import assert from "node:assert/strict";
import test from "node:test";
import { resultsToText } from "../public/js/result-copy.js";

const text = (value) => ({ textContent: value });

test("퀴즈 전체 복사에 제목과 모든 문항의 보기·정답·해설이 포함된다", () => {
  const card = (question, answer) => ({
    querySelector: () => text(question),
    querySelectorAll: (selector) => selector === ".quiz-options li"
      ? ["가", "나", "다", "라"].map(text)
      : [text(`정답: ${answer}`), text("설명")],
  });
  assert.equal(resultsToText("quiz", "퀴즈 제목", [card("첫 질문", "가"), card("둘째 질문", "나")]),
    "퀴즈 제목\n\n문항 1\n질문: 첫 질문\n보기:\n1. 가\n2. 나\n3. 다\n4. 라\n정답: 가\n해설: 설명" +
    "\n\n문항 2\n질문: 둘째 질문\n보기:\n1. 가\n2. 나\n3. 다\n4. 라\n정답: 나\n해설: 설명");
});

test("활동 전체 복사에 시간·단계·학생 수행과 학습 확인 방법이 포함된다", () => {
  const pair = (label, value) => ({ querySelector: (selector) => text(selector === "dt" ? label : value) });
  const step = (description, duration) => ({
    querySelector: (selector) => text(selector === "span" ? description : duration),
  });
  const card = {
    querySelector: (selector) => text(selector === "h3" ? "활동명" : "활동 목적"),
    querySelectorAll: (selector) => selector === ".activity-meta > div"
      ? [pair("준비물", "종이"), pair("시간", "15분"), pair("교사 안내", "안내"),
        pair("학생 수행", "포스터 작성"), pair("학습 확인 방법", "발표 확인")]
      : [step("계획하기", "5분"), step("만들기", "10분")],
  };
  assert.equal(resultsToText("activity", "학습활동 추천", [card]),
    "학습활동 추천\n\n활동 1: 활동명\n목적: 활동 목적\n권장 시간: 15분\n준비물: 종이" +
    "\n진행 단계:\n1. 계획하기 (5분)\n2. 만들기 (10분)\n교사 안내: 안내" +
    "\n학생 수행: 포스터 작성\n이해도 점검 방법: 발표 확인");
});
