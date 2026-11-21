export function resultsToText(kind, title, cards) {
  const sections = [title];
  for (const [index, card] of Array.from(cards).entries()) {
    if (kind === "quiz") {
      const options = Array.from(card.querySelectorAll(".quiz-options li"), (item, i) =>
        `${i + 1}. ${item.textContent}`
      );
      const answers = card.querySelectorAll(".answer-content p");
      sections.push([
        `문항 ${index + 1}`,
        `질문: ${card.querySelector("h3").textContent}`,
        "보기:",
        ...options,
        answers[0].textContent,
        `해설: ${answers[1].textContent}`,
      ].join("\n"));
    } else {
      const meta = Object.fromEntries(
        Array.from(card.querySelectorAll(".activity-meta > div"), (item) => [
          item.querySelector("dt").textContent,
          item.querySelector("dd").textContent,
        ]),
      );
      const steps = Array.from(card.querySelectorAll(".activity-steps li"), (item, i) =>
        `${i + 1}. ${item.querySelector("span").textContent} (${item.querySelector(".step-time").textContent})`
      );
      sections.push([
        `활동 ${index + 1}: ${card.querySelector("h3").textContent}`,
        `목적: ${card.querySelector("p").textContent}`,
        `권장 시간: ${meta["시간"]}`,
        `준비물: ${meta["준비물"]}`,
        "진행 단계:",
        ...steps,
        `교사 안내: ${meta["교사 안내"]}`,
        `학생 수행: ${meta["학생 수행"]}`,
        `이해도 점검 방법: ${meta["학습 확인 방법"]}`,
      ].join("\n"));
    }
  }
  return sections.join("\n\n");
}
