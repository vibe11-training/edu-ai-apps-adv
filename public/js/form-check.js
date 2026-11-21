export function getValidationMessage({ label, value, required, type, min, max, badInput }) {
  const trimmed = value.trim();
  if (badInput) return `${label}은(는) 숫자로 입력하세요.`;
  if (!trimmed) return required ? `${label}을(를) 입력하세요` : "";
  if (type === "number") {
    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < Number(min) || number > Number(max)) {
      return `${label}은(는) ${min}~${max}의 정수로 입력하세요.`;
    }
  }
  return "";
}

export function checkField(field) {
  const message = getValidationMessage({
    label: field.dataset.label,
    value: field.value,
    required: field.required,
    type: field.type,
    min: field.min,
    max: field.max,
    badInput: field.validity.badInput
  });
  document.getElementById(`${field.id}-error`).textContent = message;
  if (message) {
    field.setAttribute("aria-invalid", "true");
  } else {
    field.removeAttribute("aria-invalid");
  }
  return !message;
}

export function checkForm(form) {
  const fields = [...form.querySelectorAll("input, textarea, select")];
  const invalidFields = fields.filter((field) => !checkField(field));
  if (invalidFields.length) invalidFields[0].focus();
  return invalidFields.length === 0;
}
