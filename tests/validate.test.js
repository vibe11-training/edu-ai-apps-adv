import assert from "node:assert/strict";
import test from "node:test";
import { validate, validateActivities } from "../api/validate.js";

function makeQuestion(number) {
  const options = [
    `보기 ${number}-1`,
    `보기 ${number}-2`,
    `보기 ${number}-3`,
    `보기 ${number}-4`,
  ];

  return {
    question: `문항 ${number}`,
    options,
    answer: options[0],
    explanation: "첫 번째 보기가 정답인 이유입니다.",
  };
}

function makeActivity(number, overrides = {}) {
  return {
    name: `활동 ${number}`,
    purpose: `활동 ${number}의 목적`,
    materials: "준비물 없음",
    steps: [{ description: "활동 진행", minutes: 15 }],
    teacherGuidance: "교사가 활동 방법을 안내합니다.",
    studentTask: `학생 과제 ${number}`,
    assessmentMethod: "학생의 설명으로 학습 내용을 확인합니다.",
    ...overrides,
  };
}

function assertValid(result) {
  assert.equal(result, true);
}

function assertInvalid(result) {
  assert.equal(result, false);
}

test("퀴즈 수용 기준", async (t) => {
  await t.test("문항 수 1과 10을 허용하고 요청 수와 일치시킨다", () => {
    assertValid(validate([makeQuestion(1)], { count: 1 }));
    assertValid(validate(
      Array.from({ length: 10 }, (_, index) => makeQuestion(index + 1)),
      { count: 10 },
    ));
  });

  await t.test("요청 문항 수가 범위를 벗어나거나 결과 수와 다르면 거부한다", () => {
    for (const count of [0, 11, 1.5]) {
      assertInvalid(validate([makeQuestion(1)], { count }));
    }
    assertInvalid(validate([makeQuestion(1)], { count: 2 }));
  });

  await t.test("각 문항에 문제, 서로 다른 보기 4개, 보기 중 정답, 해설을 요구한다", () => {
    const validQuestion = makeQuestion(1);
    const invalidQuestions = [
      { ...validQuestion, question: " " },
      { ...validQuestion, options: validQuestion.options.slice(0, 3) },
      { ...validQuestion, options: ["같은 보기", "같은 보기", "보기 3", "보기 4"] },
      { ...validQuestion, answer: "보기 밖의 정답" },
      { ...validQuestion, explanation: "" },
    ];

    for (const question of invalidQuestions) {
      assertInvalid(validate([question], { count: 1 }));
    }
  });
  await t.test("각 문항의 빈 보기, 빈 정답과 잘못된 보기 수를 거부한다", () => {
    const valid = makeQuestion(1);
    for (const invalid of [
      { ...valid, options: [...valid.options, "다섯 번째"] },
      { ...valid, options: [" ", ...valid.options.slice(1)] },
      { ...valid, options: ["보기", " 보기 ", "셋", "넷"] },
      { ...valid, answer: " " },
      { ...valid, answer: null },
      null,
    ]) {
      assertInvalid(validate([valid, invalid], { count: 2 }));
    }
  });
});

test("학습활동 수용 기준", async (t) => {
  await t.test("활동 3개와 필수 항목을 갖춘 결과를 허용한다", () => {
    const activities = Array.from({ length: 3 }, (_, index) =>
      makeActivity(index + 1)
    );
    assertValid(validateActivities(activities, { duration: 45 }));
  });

  await t.test("활동 시간의 입력 경계와 여러 단계의 합계를 검사한다", () => {
    const short = [
      makeActivity(1, { steps: [{ description: "단계", minutes: 1 }] }),
      makeActivity(2, { steps: [{ description: "단계", minutes: 1 }] }),
      makeActivity(3, { steps: [{ description: "단계", minutes: 1 }] }),
    ];
    assertValid(validateActivities(short, { duration: 1 }));
    assertValid(validateActivities(short, { duration: 180 }));
    for (const duration of [0, 181, 1.5]) {
      assertInvalid(validateActivities(short, { duration }));
    }
    const multiStep = [
      makeActivity(1),
      makeActivity(2),
      makeActivity(3, { steps: [{ description: "시작", minutes: 20 }, { description: "마무리", minutes: 25 }] }),
    ];
    assertValid(validateActivities(multiStep, { duration: 45 }));
    multiStep[2].steps[1].minutes = 26;
    assertInvalid(validateActivities(multiStep, { duration: 45 }));
    for (const minutes of [-1, 0, NaN, Infinity, "5"]) {
      multiStep[2].steps[1].minutes = minutes;
      assertInvalid(validateActivities(multiStep, { duration: 45 }));
    }
  });

  await t.test("활동 수, 이름, 학생 과제가 서로 다르지 않으면 거부한다", () => {
    assertInvalid(validateActivities(
      [makeActivity(1), makeActivity(2)],
      { duration: 45 },
    ));
    assertInvalid(validateActivities(
      [makeActivity(1), makeActivity(2), makeActivity(3), makeActivity(4)],
      { duration: 45 },
    ));

    const duplicateName = [
      makeActivity(1),
      makeActivity(2, { name: "같은 활동명" }),
      makeActivity(3, { name: "같은 활동명" }),
    ];
    assertInvalid(validateActivities(duplicateName, { duration: 45 }));

    const duplicateTask = [
      makeActivity(1),
      makeActivity(2, { studentTask: "같은 학생 과제" }),
      makeActivity(3, { studentTask: "같은 학생 과제" }),
    ];
    assertInvalid(validateActivities(duplicateTask, { duration: 45 }));
  });

  await t.test("필수 항목과 단계별 시간을 검사한다", () => {
    const emptyRequiredFields = {
      name: "",
      purpose: "",
      materials: "",
      steps: [],
      teacherGuidance: "",
      studentTask: "",
      assessmentMethod: "",
    };

    for (const [field, value] of Object.entries(emptyRequiredFields)) {
      const activities = [
        makeActivity(1, { [field]: value }),
        makeActivity(2),
        makeActivity(3),
      ];
      assertInvalid(validateActivities(activities, { duration: 45 }));
    }

    assertInvalid(validateActivities([
      makeActivity(1, { steps: [{ description: "", minutes: 1 }] }),
      makeActivity(2),
      makeActivity(3),
    ], { duration: 45 }));
    assertInvalid(validateActivities([
      makeActivity(1, { steps: [{ description: "단계", minutes: 0 }] }),
      makeActivity(2),
      makeActivity(3),
    ], { duration: 45 }));
    assertInvalid(validateActivities([
      makeActivity(1, { steps: [{ description: "단계", minutes: 46 }] }),
      makeActivity(2),
      makeActivity(3),
    ], { duration: 45 }));
  });

  await t.test("단계별 시간 합계가 활동 시간을 넘지 않도록 한다", () => {
    const activities = [
      makeActivity(1, { steps: [{ description: "단계", minutes: 45 }] }),
      makeActivity(2),
      makeActivity(3),
    ];
    assertValid(validateActivities(activities, { duration: 45 }));

    const overTime = [
      makeActivity(1, { steps: [{ description: "단계", minutes: 46 }] }),
      makeActivity(2),
      makeActivity(3),
    ];
    assertInvalid(validateActivities(overTime, { duration: 45 }));
  });
});
