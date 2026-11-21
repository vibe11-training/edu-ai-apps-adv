import { rowsToCsv } from "./csv.js";

export function activityCardsToCsv(cards) {
  const rows = [["활동명", "활동 목적", "준비물", "진행 단계 및 시간", "교사 안내", "학생 수행", "학습 확인 방법"]];
  for (const card of cards) {
    const meta = Object.fromEntries(
      Array.from(card.querySelectorAll(".activity-meta > div"), (item) => [
        item.querySelector("dt").textContent,
        item.querySelector("dd").textContent,
      ]),
    );
    const steps = Array.from(card.querySelectorAll(".activity-steps li"), (item, index) =>
      `${index + 1}. ${item.querySelector("span").textContent} (${item.querySelector(".step-time").textContent})`
    );
    rows.push([
      card.querySelector("h3").textContent,
      card.querySelector("p").textContent,
      meta["준비물"],
      steps.join("\n"),
      meta["교사 안내"],
      meta["학생 수행"],
      meta["학습 확인 방법"],
    ]);
  }
  return rowsToCsv(rows);
}
