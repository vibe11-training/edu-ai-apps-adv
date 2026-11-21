import assert from "node:assert/strict";
import test from "node:test";
import { quizCardsToCsv } from "../public/js/quiz-csv.js";

function card(question, options, answer, explanation) {
  const text = (value) => ({ textContent: value });
  return {
    querySelector: () => text(question),
    querySelectorAll: (selector) => selector === ".quiz-options li"
      ? options.map(text)
      : [text(`정답: ${answer}`), text(explanation)],
  };
}

function readCsv(csv) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const character = csv[i];
    if (quoted) {
      if (character === '"' && csv[i + 1] === '"') { value += '"'; i++; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\r" && csv[i + 1] === "\n") {
      row.push(value); rows.push(row); row = []; value = ""; i++;
    } else value += character;
  }
  assert.equal(quoted, false);
  return rows;
}

test("표시된 퀴즈 값을 BOM CSV로 내보내고 쉼표·따옴표·줄바꿈을 보존한다", () => {
  const cards = [
    card('질문, "하나"\n둘', ["보기, ①", '보기 "②"', "보기\n③", "보기 ④"], '보기 "②"', "한글 해설\r\n두 번째 줄"),
    card("두 번째 질문", ["가", "나", "다", "라"], "가", "두 번째 해설"),
  ];
  const csv = quizCardsToCsv(cards);
  const bytes = new TextEncoder().encode(csv);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const rows = readCsv(new TextDecoder().decode(bytes.slice(3)));
  assert.deepEqual(rows, [
    ["번호", "질문", "보기 ①", "보기 ②", "보기 ③", "보기 ④", "정답", "해설"],
    ["1", '질문, "하나"\n둘', "보기, ①", '보기 "②"', "보기\n③", "보기 ④", '보기 "②"', "한글 해설\r\n두 번째 줄"],
    ["2", "두 번째 질문", "가", "나", "다", "라", "가", "두 번째 해설"],
  ]);
});
