function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isWithinRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validate(response, request) {
  if (!Array.isArray(response) || !isRecord(request)) return false;
  if (!isWithinRange(request.count, 1, 10) || response.length !== request.count) {
    return false;
  }

  return Array.from(response).every((question) => {
    if (!isRecord(question) || !isNonEmptyString(question.question)) return false;
    if (!Array.isArray(question.options) || question.options.length !== 4) return false;
    if (!Array.from(question.options).every(isNonEmptyString)) return false;

    const options = question.options.map(normalizedText);
    if (new Set(options).size !== 4) return false;
    if (!isNonEmptyString(question.answer)) return false;
    if (!options.includes(normalizedText(question.answer))) return false;
    return isNonEmptyString(question.explanation);
  });
}

export function validateActivities(response, request) {
  if (!Array.isArray(response) || response.length !== 3 || !isRecord(request)) {
    return false;
  }
  if (!isWithinRange(request.duration, 1, 180)) return false;

  const names = new Set();
  const studentTasks = new Set();

  return Array.from(response).every((activity) => {
    if (!isRecord(activity)) return false;
    const requiredTextFields = [
      activity.name,
      activity.purpose,
      activity.materials,
      activity.teacherGuidance,
      activity.studentTask,
      activity.assessmentMethod,
    ];
    if (!requiredTextFields.every(isNonEmptyString)) return false;

    const name = normalizedText(activity.name);
    const studentTask = normalizedText(activity.studentTask);
    if (names.has(name) || studentTasks.has(studentTask)) return false;
    names.add(name);
    studentTasks.add(studentTask);

    if (!Array.isArray(activity.steps) || activity.steps.length === 0) return false;
    let totalMinutes = 0;
    for (const step of activity.steps) {
      if (!isRecord(step) || !isNonEmptyString(step.description)) return false;
      if (typeof step.minutes !== "number" || !Number.isFinite(step.minutes) || step.minutes <= 0) {
        return false;
      }
      totalMinutes += step.minutes;
    }

    return totalMinutes <= request.duration;
  });
}
