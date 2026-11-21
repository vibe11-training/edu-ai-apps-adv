import { checkField, checkForm } from "./form-check.js";
import { loadMockResults, ResultValidationError } from "./mock-results.js";
import { quizCardsToCsv } from "./quiz-csv.js";
import { activityCardsToCsv } from "./activity-csv.js";
import { resultsToText } from "./result-copy.js";

const form = document.getElementById("preparation-form");
const results = document.getElementById("generated-results");
const summary = document.getElementById("input-summary");
const submitButton = form.querySelector('button[type="submit"]');
const copyButton = document.getElementById("copy-all");
const copyStatus = document.getElementById("copy-status");
const kind = form.elements.count ? "quiz" : "activity";
const downloadButton = document.getElementById(`${kind}-csv-download`);
let submitted = false;
let copyTimer;
let resultVersion = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderQuiz(question, index) {
  const card = element("article", undefined, "preview-card");
  card.append(element("span", `객관식 예시 ${index + 1}`, "badge"));
  card.append(element("h3", question.question));
  const options = element("ol", undefined, "quiz-options");
  for (const option of question.options) options.append(element("li", option));
  const details = element("details");
  const answer = element("div", undefined, "answer-content");
  answer.append(element("p", `정답: ${question.answer}`), element("p", question.explanation));
  details.append(element("summary", "정답과 해설 보기"), answer);
  card.append(options, details);
  return card;
}

function renderActivity(activity, index) {
  const card = element("article", undefined, "preview-card");
  card.append(element("span", `활동 ${index + 1}`, "badge"));
  card.append(element("h3", activity.name), element("p", activity.purpose));
  const meta = element("dl", undefined, "activity-meta");
  const totalMinutes = activity.steps.reduce((sum, step) => sum + step.minutes, 0);
  for (const [label, value] of [["준비물", activity.materials], ["시간", `${totalMinutes}분`]]) {
    const item = element("div");
    item.append(element("dt", label), element("dd", value));
    meta.append(item);
  }
  const steps = element("ol", undefined, "activity-steps");
  for (const step of activity.steps) {
    const item = element("li");
    item.append(element("span", step.description), element("span", `${step.minutes}분`, "step-time"));
    steps.append(item);
  }
  card.append(meta, element("h4", "진행 단계"), steps);
  const guidance = element("dl", undefined, "activity-meta");
  for (const [label, value] of [
    ["교사 안내", activity.teacherGuidance],
    ["학생 수행", activity.studentTask],
    ["학습 확인 방법", activity.assessmentMethod],
  ]) {
    const item = element("div");
    item.append(element("dt", label), element("dd", value));
    guidance.append(item);
  }
  card.append(guidance);
  return card;
}

function renderSummary(fields) {
  const list = element("dl", undefined, "result-list");
  for (const { label, value } of fields) {
    const item = element("div");
    item.append(element("dt", label), element("dd", value || "입력하지 않음"));
    list.append(item);
  }
  summary.replaceChildren(list);
}

function showError(message) {
  const error = element("p", message, "error");
  error.setAttribute("role", "alert");
  const retry = element("button", "다시 시도", "secondary-button");
  retry.type = "button";
  retry.addEventListener("click", () => form.requestSubmit());
  results.replaceChildren(error, retry);
}

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    const cards = results.querySelectorAll(".preview-card");
    const csv = kind === "quiz" ? quizCardsToCsv(cards) : activityCardsToCsv(cards);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = kind === "quiz" ? "퀴즈.csv" : "학습활동.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

copyButton.addEventListener("click", async () => {
  const version = resultVersion;
  clearTimeout(copyTimer);
  copyStatus.textContent = "";
  copyButton.disabled = true;
  try {
    const text = resultsToText(kind, document.querySelector("h1").textContent, results.querySelectorAll(".preview-card"));
    await navigator.clipboard.writeText(text);
    if (version !== resultVersion) return;
    copyStatus.className = "copy-status";
    copyStatus.textContent = "복사됨";
    copyTimer = setTimeout(() => { copyStatus.textContent = ""; }, 2000);
  } catch (error) {
    console.error("결과를 복사하지 못했습니다.", error);
    if (version !== resultVersion) return;
    copyStatus.className = "error";
    copyStatus.textContent = "복사하지 못했습니다. 클립보드 권한을 확인해 주세요.";
  } finally {
    if (version === resultVersion) copyButton.disabled = false;
  }
});

form.addEventListener("input", (event) => {
  if (submitted && event.target.matches("input, textarea, select")) {
    checkField(event.target);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  submitted = true;
  resultVersion++;
  clearTimeout(copyTimer);
  copyStatus.textContent = "";
  copyButton.disabled = true;
  if (downloadButton) downloadButton.disabled = true;
  results.replaceChildren();
  summary.replaceChildren();
  if (!checkForm(form)) {
    results.append(element("p", "입력 항목을 확인해 주세요.", "error"));
    return;
  }

  const fields = [...form.querySelectorAll("input, textarea, select")].map((field) => ({
    label: field.dataset.label,
    value: field.value.trim(),
  }));
  const input = Object.fromEntries(
    [...form.querySelectorAll("input, textarea, select")].map((field) => [
      field.name,
      field.type === "number" ? Number(field.value) : field.value,
    ]),
  );

  submitButton.disabled = true;
  results.append(element("p", "결과를 생성하고 있습니다."));
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: kind, input }),
    });
    const data = await response.json();
    if (response.status !== 200) {
      showError(typeof data?.error === "string" && data.error.trim()
        ? data.error
        : `생성 요청에 실패했습니다. (HTTP ${response.status})`);
      return;
    }
    const list = element("div", undefined, "preview-list");
    data.forEach((item, index) => list.append(kind === "quiz"
      ? renderQuiz(item, index)
      : renderActivity(item, index)));
    results.replaceChildren(list);
    renderSummary(fields);
    copyButton.disabled = data.length === 0;
    if (downloadButton) downloadButton.disabled = data.length === 0;
  } catch (error) {
    console.error("결과를 불러오지 못했습니다.", error);
    showError("결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    submitButton.disabled = false;
  }
});
