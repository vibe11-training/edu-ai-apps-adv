import { rowsToCsv } from "./csv.js";

export function quizCardsToCsv(cards) {
  const rows = [["번호", "질문", "보기 ①", "보기 ②", "보기 ③", "보기 ④", "정답", "해설"]];
  for (const [index, card] of Array.from(cards).entries()) {
    const answers = card.querySelectorAll(".answer-content p");
    rows.push([
      index + 1,
      card.querySelector("h3").textContent,
      ...Array.from(card.querySelectorAll(".quiz-options li"), (option) => option.textContent),
      answers[0].textContent.slice("정답: ".length),
      answers[1].textContent,
    ]);
  }
  return rowsToCsv(rows);
}
