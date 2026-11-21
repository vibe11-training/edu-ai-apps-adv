import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quiz = JSON.parse(await readFile(new URL("../mock/quiz-questions.json", import.meta.url), "utf8"));
const activities = JSON.parse(await readFile(new URL("../mock/activities.json", import.meta.url), "utf8"));

class Node {
  constructor(tag = "div", text = "") {
    this.tag = tag;
    this.text = text;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.text = ""; this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { if (!this.disabled && this.listeners.click) return this.listeners.click({ preventDefault() {}, target: this }); }
  remove() {}
  matches() { return true; }
  focus() { this.focused = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const parts = selector.replace(/\s*>\s*/g, " > ").trim().split(/\s+/);
    const matches = (node, part) => part.startsWith(".")
      ? (node.className || "").split(/\s+/).includes(part.slice(1))
      : node.tag === part;
    const matchesParts = (node, index) => {
      if (!node || !matches(node, parts[index])) return false;
      if (index === 0) return true;
      if (parts[index - 1] === ">") return matchesParts(node.parent, index - 2);
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (matchesParts(ancestor, index - 1)) return true;
      }
      return false;
    };
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesParts(child, parts.length - 1)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

// Use the controls and constraints from the actual HTML, not a second hand-written form.
async function setup(kind, fetchData) {
  const html = await readFile(new URL(`../public/${kind}.html`, import.meta.url), "utf8");
  const formHtml = html.match(/<form\b[\s\S]*?<\/form>/)[0];
  const form = new Node("form");
  const errors = {};
  const fields = [...formHtml.matchAll(/<(input|textarea|select)\b([^>]*)>/g)].map((match) => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const field = new Node(match[1]);
    Object.assign(field, {
      id: attrs.id, name: attrs.name, dataset: { label: attrs["data-label"] },
      type: attrs.type || (match[1] === "select" ? "select-one" : "text"),
      min: attrs.min || "", max: attrs.max || "", required: /\brequired\b/.test(match[2]),
      validity: { badInput: false }, value: "",
    });
    errors[`${field.id}-error`] = new Node("p");
    return field;
  });
  form.elements = Object.fromEntries(fields.map((field) => [field.name, field]));
  const button = new Node("button");
  form.querySelector = () => button;
  form.querySelectorAll = () => fields;
  form.requestSubmit = () => { form.retry = form.listeners.submit({ preventDefault() {} }); };
  const results = new Node();
  const summary = new Node();
  const downloadTag = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find((match) => /CSV/i.test(match[2]));
  const download = downloadTag && new Node("button", downloadTag[2].replace(/<[^>]+>/g, ""));
  if (download) {
    download.disabled = /\bdisabled\b/.test(downloadTag[1]);
    download.id = downloadTag[1].match(/\bid="([^"]+)"/)?.[1];
  }
  const copy = new Node("button");
  copy.disabled = true;
  const elements = { "preparation-form": form, "generated-results": results, "input-summary": summary,
    "copy-all": copy, "copy-status": new Node("p"), ...errors };
  if (download?.id) elements[download.id] = download;
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldCreateObjectURL = URL.createObjectURL;
  const oldRevokeObjectURL = URL.revokeObjectURL;
  const blobs = new Map();
  const downloads = [];
  const clipboard = {
    copied: [],
    async writeText(value) { this.copied.push(value); },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
  URL.createObjectURL = (blob) => { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  const body = new Node("body");
  globalThis.document = {
    body,
    getElementById: (id) => elements[id],
    querySelector: (selector) => selector === "h1" ? new Node("h1", kind === "quiz" ? "퀴즈 생성기" : "학습활동 추천")
      : selector.startsWith("#") ? elements[selector.slice(1)] : null,
    createElement: (tag) => {
      const node = new Node(tag);
      if (tag === "a") node.click = () => downloads.push({ href: node.href, blob: blobs.get(node.href), filename: node.download });
      return node;
    },
  };
  globalThis.fetch = fetchData;
  try {
    await import(`../public/js/app.js?test=${kind}-${Math.random()}`);
  } catch (error) {
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    URL.createObjectURL = oldCreateObjectURL;
    URL.revokeObjectURL = oldRevokeObjectURL;
    throw error;
  }
  return {
    form, fields, errors, results, summary, download, downloads, copy, clipboard, copyStatus: elements["copy-status"],
    submit: () => form.listeners.submit({ preventDefault() {} }),
    cleanup() {
      globalThis.document = oldDocument; globalThis.fetch = oldFetch;
      if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
      else delete globalThis.navigator;
      URL.createObjectURL = oldCreateObjectURL; URL.revokeObjectURL = oldRevokeObjectURL;
    },
  };
}

function fill(form, kind) {
  const values = {
    subject: "중학교 정보", level: "중1", topic: "알고리즘과 프로그래밍", goal: "알고리즘의 개념 설명",
    ...(kind === "quiz" ? { count: "3", difficulty: "보통" } : {
      duration: "40", students: "30", groupSize: "4", conditions: "",
    }),
  };
  for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
}

for (const kind of ["quiz", "activity"]) {
  test(`${kind}: 과목, 학년, 주제를 목록에서 선택하고 목표를 직접 입력한다`, async () => {
    const html = await readFile(new URL(`../public/${kind}.html`, import.meta.url), "utf8");
    const expectedOptions = {
      subject: ["중학교 정보", "고등학교 정보", "인공지능 기초", "데이터 과학", "소프트웨어와 생활", "프로그래밍"],
      level: ["중1", "중2", "중3", "고1", "고2", "고3"],
      topic: ["컴퓨팅 시스템", "데이터", "알고리즘과 프로그래밍", "인공지능", "디지털 문화"],
    };
    for (const [name, expected] of Object.entries(expectedOptions)) {
      const select = html.match(new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select, `${name} 선택 목록`);
      assert.match(select[1], /^\s*<option value="">/);
      const options = [...select[1].matchAll(/<option(?:\s[^>]*)?>([^<]*)<\/option>/g)].map((option) => option[1]);
      assert.deepEqual(options, ["선택해 주세요", ...expected]);
    }
    assert.match(html, /<textarea\b[^>]*\bname="goal"[^>]*\brequired\b/);

    let request;
    const ui = await setup(kind, async (url, options) => {
      request = JSON.parse(options.body);
      return response(kind === "quiz" ? quiz.slice(0, 3) : activities);
    });
    try {
      fill(ui.form, kind);
      await ui.submit();
      assert.equal(request.input.subject, "중학교 정보");
      assert.equal(request.input.level, "중1");
      assert.equal(request.input.topic, "알고리즘과 프로그래밍");
      assert.equal(request.input.goal, "알고리즘의 개념 설명");
    } finally { ui.cleanup(); }
  });

  test(`${kind}: 필수 항목을 빠뜨리면 해당 항목을 안내하고 요청하지 않는다`, async () => {
    let requests = 0;
    const ui = await setup(kind, async () => { requests++; return response([]); });
    try {
      fill(ui.form, kind);
      const required = kind === "quiz"
        ? ["subject", "level", "topic", "goal", "count", "difficulty"]
        : ["subject", "level", "topic", "goal", "duration", "students", "groupSize"];
      for (const name of required) {
        const field = ui.form.elements[name];
        assert.ok(field, `${name} 필드 존재`);
        assert.equal(field.required, true, `${name} 필수`);
        const value = field.value;
        field.value = field.type === "select-one" ? "" : " ";
        await ui.submit();
        assert.match(ui.errors[`${field.id}-error`].textContent, /입력/);
        assert.equal(field.attributes["aria-invalid"], "true");
        assert.equal(field.focused, true);
        assert.equal(requests, 0);
        field.value = value;
        field.focused = false;
      }
    } finally { ui.cleanup(); }
  });
}

test("숫자 입력의 경계값은 요청하고 범위 밖과 소수는 요청하지 않는다", async () => {
  for (const [kind, name, accepted, rejected] of [
    ["quiz", "count", ["1", "10"], ["0", "11", "1.5"]],
    ["activity", "duration", ["1", "180"], ["0", "181", "1.5"]],
    ["activity", "students", ["1", "100"], ["0", "101", "1.5"]],
    ["activity", "groupSize", ["2", "6"], ["1", "7", "2.5"]],
  ]) {
    let requests = 0;
    const ui = await setup(kind, async () => { requests++; return response(kind === "quiz" ? quiz : activities); });
    try {
      fill(ui.form, kind);
      const field = ui.form.elements[name];
      for (const value of rejected) {
        field.value = value;
        const before = requests;
        await ui.submit();
        assert.equal(requests, before, `${name}=${value}`);
        assert.match(ui.errors[`${field.id}-error`].textContent, /정수/);
      }
      for (const value of accepted) {
        field.value = value;
        const before = requests;
        await ui.submit();
        assert.equal(requests, before + 1, `${name}=${value}`);
        assert.equal(ui.errors[`${field.id}-error`].textContent, "");
      }
    } finally { ui.cleanup(); }
  }
});

test("검증된 예시를 화면에 모든 필수 내용과 함께 표시한다", async () => {
  for (const kind of ["quiz", "activity"]) {
    const data = kind === "quiz" ? quiz.slice(0, 3) : activities;
    const ui = await setup(kind, async () => response(data));
    try {
      fill(ui.form, kind);
      await ui.submit();
      const cards = ui.results.children[0].children;
      assert.equal(cards.length, 3);
      for (let i = 0; i < 3; i++) {
        const text = cards[i].textContent;
        if (kind === "quiz") {
          for (const value of [data[i].question, ...data[i].options, data[i].answer, data[i].explanation]) assert.ok(text.includes(value));
        } else {
          for (const value of [data[i].name, data[i].purpose, data[i].materials, data[i].teacherGuidance, data[i].studentTask, data[i].assessmentMethod]) assert.ok(text.includes(value));
          for (const step of data[i].steps) {
            assert.ok(text.includes(step.description));
            assert.ok(text.includes(`${step.minutes}분`));
          }
        }
      }
    } finally { ui.cleanup(); }
  }
});

test("실패나 잘못된 응답은 이전 성공 결과를 지우고 재시도할 수 있다", async () => {
  for (const kind of ["quiz", "activity"]) {
    const data = kind === "quiz" ? quiz.slice(0, 3) : activities;
    let mode = "success";
    const ui = await setup(kind, async () => {
      if (mode === "network") throw new Error("offline");
      if (mode === "invalid") return response({ error: "AI 응답이 검증을 통과하지 못했습니다." }, 502);
      return response(data);
    });
    try {
      fill(ui.form, kind);
      await ui.submit();
      assert.equal(ui.results.children[0].children.length, 3);
      for (const failure of ["network", "invalid"]) {
        mode = failure;
        await ui.submit();
        assert.equal(ui.results.children[0].attributes.role, "alert");
        assert.match(ui.results.textContent, /다시 시도/);
        assert.equal(ui.results.textContent.includes(data[0].name || data[0].question), false);
        assert.equal(ui.summary.textContent, "");
        mode = "success";
        ui.results.children[1].listeners.click();
        await ui.form.retry;
        assert.equal(ui.results.children[0].children.length, 3);
      }
    } finally { ui.cleanup(); }
  }
});

for (const kind of ["quiz", "activity"]) {
  test(`${kind}: 전체 복사는 결과가 있을 때만 동작하고 성공·실패 상태를 안내한다`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.mock.method(console, "error", () => {});
    const data = kind === "quiz" ? quiz.slice(0, 3) : activities;
    let mode = "success";
    let requests = 0;
    const ui = await setup(kind, async () => {
      requests++;
      return mode === "success" ? response(data) : response({ error: "서버 오류" }, 502);
    });
    try {
      fill(ui.form, kind);
      assert.equal(ui.copy.disabled, true);
      await ui.copy.click();
      assert.equal(ui.clipboard.copied.length, 0);

      const pending = ui.submit();
      assert.equal(ui.copy.disabled, true);
      await pending;
      assert.equal(ui.copy.disabled, false);
      await ui.copy.click();
      assert.equal(ui.clipboard.copied.length, 1);
      assert.match(ui.clipboard.copied[0], kind === "quiz" ? /퀴즈 생성기/ : /학습활동 추천/);
      assert.ok(ui.clipboard.copied[0].includes(kind === "quiz" ? data[0].question : data[0].studentTask));
      assert.equal(ui.copyStatus.textContent, "복사됨");
      assert.equal(ui.copy.disabled, false);
      assert.equal(requests, 1, "복사 시 서버에 요청하지 않는다");
      t.mock.timers.tick(2000);
      assert.equal(ui.copyStatus.textContent, "");

      ui.clipboard.writeText = async () => { throw new Error("권한 거부"); };
      await ui.copy.click();
      assert.match(ui.copyStatus.textContent, /복사하지 못했습니다/);
      assert.equal(ui.copy.disabled, false);

      mode = "failure";
      await ui.submit();
      assert.equal(ui.copy.disabled, true);
      assert.equal(ui.copyStatus.textContent, "");
      assert.equal(ui.results.children[0].attributes.role, "alert");
    } finally { ui.cleanup(); }
  });
}

test("이전 복사 요청이 늦게 끝나도 새 결과의 버튼 상태를 변경하지 않는다", async () => {
  let finishCopy;
  let finishRequest;
  let first = true;
  const ui = await setup("quiz", () => {
    if (first) {
      first = false;
      return Promise.resolve(response(quiz.slice(0, 3)));
    }
    return new Promise((resolve) => { finishRequest = resolve; });
  });
  try {
    fill(ui.form, "quiz");
    await ui.submit();
    ui.clipboard.writeText = () => new Promise((resolve) => { finishCopy = resolve; });
    const copy = ui.copy.click();
    assert.equal(ui.copy.disabled, true);
    const submit = ui.submit();
    finishCopy();
    await copy;
    assert.equal(ui.copy.disabled, true);
    assert.equal(ui.copyStatus.textContent, "");
    finishRequest(response({ error: "서버 오류" }, 502));
    await submit;
    assert.equal(ui.copy.disabled, true);
    assert.equal(ui.copyStatus.textContent, "");
  } finally { ui.cleanup(); }
});

test("활동 CSV 버튼은 결과가 있을 때만 활성화되고 서버를 호출하지 않는다", async () => {
  let resolveRequest;
  let requests = 0;
  const ui = await setup("activity", () => {
    requests++;
    return new Promise((resolve) => { resolveRequest = resolve; });
  });
  try {
    fill(ui.form, "activity");
    assert.equal(ui.download.disabled, true);
    const first = ui.submit();
    assert.equal(ui.download.disabled, true);
    resolveRequest(response(activities));
    await first;
    assert.equal(ui.download.disabled, false);
    ui.download.click();
    assert.equal(requests, 1);
    assert.equal(ui.downloads[0].filename, "학습활동.csv");
    const second = ui.submit();
    assert.equal(ui.download.disabled, true);
    resolveRequest(response({ error: "서버 오류" }, 502));
    await second;
    assert.equal(ui.download.disabled, true);
    await ui.download.click();
    assert.equal(ui.downloads.length, 1);
  } finally { ui.cleanup(); }
});

    test("서버가 초과 응답을 거부하면 오류와 재시도를 표시한다", async () => {
      const ui = await setup("quiz", async () => response({ error: "AI 응답이 검증을 통과하지 못했습니다." }, 502));
      try {
        fill(ui.form, "quiz");
        await ui.submit();
        assert.equal(ui.results.children[0].attributes.role, "alert");
        assert.match(ui.results.textContent, /다시 시도/);
        assert.equal(ui.results.textContent.includes(quiz[0].question), false);
        assert.equal(ui.summary.textContent, "");
      } finally { ui.cleanup(); }
    });

    function requestValues(input, options = {}) {
      assert.equal(String(input), "/api/generate");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      return JSON.parse(options.body);
    }

    for (const kind of ["quiz", "activity"]) {
      test(`${kind}: 생성 요청에 수업 입력과 운영 설정을 전달한다`, async () => {
        const calls = [];
        const data = kind === "quiz" ? quiz.slice(0, 3) : activities;
        const ui = await setup(kind, async (input, options) => {
          calls.push(requestValues(input, options));
          return response(data);
        });
        try {
          fill(ui.form, kind);
          ui.form.elements.subject.value = "데이터 과학";
          ui.form.elements.topic.value = "데이터";
          ui.form.elements.goal.value = "데이터를 분석한다";
          if (kind === "activity") ui.form.elements.conditions.value = "종이 없이 진행";
          await ui.submit();
          assert.ok(calls.length > 0, "생성 요청이 있어야 한다");
          assert.equal(calls[0].type, kind);
          const names = kind === "quiz"
            ? ["subject", "level", "topic", "goal", "count", "difficulty"]
            : ["subject", "level", "topic", "goal", "duration", "students", "groupSize", "conditions"];
          const expected = Object.fromEntries(names.map((name) => {
            const field = ui.form.elements[name];
            return [name, field.type === "number" ? Number(field.value) : field.value];
          }));
          assert.deepEqual(calls[0], { type: kind, input: expected });
        } finally { ui.cleanup(); }
      });
    }

    test("퀴즈 난이도 변경은 매 생성 요청에 반영된다", async () => {
      const calls = [];
      const ui = await setup("quiz", async (input, options) => {
        calls.push(requestValues(input, options));
        return response(quiz.slice(0, 3));
      });
      try {
        fill(ui.form, "quiz");
        for (const difficulty of ["쉬움", "보통", "어려움"]) {
          ui.form.elements.difficulty.value = difficulty;
          const before = calls.length;
          await ui.submit();
          assert.ok(calls.slice(before).some((call) => call.type === "quiz" && call.input.difficulty === difficulty),
            `${difficulty} 난이도가 생성 요청에 전달되어야 한다`);
        }
      } finally { ui.cleanup(); }
    });

    test("유효한 열 문항 응답은 열 문항을 표시한다", async () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({ ...quiz[i % quiz.length], question: `문항 ${i + 1}` }));
      const ui = await setup("quiz", async () => response(ten));
      try {
        fill(ui.form, "quiz");
        ui.form.elements.count.value = "10";
        await ui.submit();
        assert.equal(ui.results.children[0].children.length, 10);
      } finally { ui.cleanup(); }
    });

    // Small strict CSV reader: quoted commas, quotes and embedded line breaks must
    // survive a round trip, rather than passing by comparing raw CSV strings.
    function parseCsv(text) {
      const rows = [], row = [];
      let cell = "", quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') quoted = false;
          else cell += ch;
        } else if (ch === '"' && cell === "") quoted = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\r" || ch === "\n") {
          row.push(cell); cell = ""; rows.push(row.splice(0));
          if (ch === "\r" && text[i + 1] === "\n") i++;
        } else cell += ch;
      }
      assert.equal(quoted, false, "CSV 따옴표가 닫혀야 한다");
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows;
    }

    for (const kind of ["quiz", "activity"]) {
      test(`${kind}: CSV 다운로드는 BOM, 머리글, 화면 값 및 특수문자를 보존한다`, async () => {
        const data = structuredClone(kind === "quiz" ? quiz.slice(0, 3) : activities);
        if (kind === "quiz") {
          data[0].question = '쉼표, "따옴표"\n줄바꿈 문제';
          data[0].explanation = '정답 설명, "인용"\n다음 줄';
        } else {
          data[0].purpose = '목적, "인용"\n다음 줄';
          data[0].steps[0].description = '단계, "인용"\n다음 줄';
        }
        const ui = await setup(kind, async () => response(data));
        try {
          fill(ui.form, kind);
          await ui.submit();
          assert.equal(ui.results.children[0].children.length, 3, "먼저 결과가 표시되어야 한다");
          assert.ok(ui.download, "CSV 다운로드 버튼이 있어야 한다");
          assert.equal(ui.download.disabled, false, "성공 후 CSV 다운로드가 가능해야 한다");
          await ui.download.click();
          assert.equal(ui.downloads.length, 1, "파일 다운로드가 시작되어야 한다");
          const bytes = new Uint8Array(await ui.downloads[0].blob.arrayBuffer());
          assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM");
          const rows = parseCsv(new TextDecoder("utf-8").decode(bytes.slice(3)));
          const headers = kind === "quiz"
            ? ["번호", "질문", "보기 ①", "보기 ②", "보기 ③", "보기 ④", "정답", "해설"]
            : ["활동명", "활동 목적", "준비물", "진행 단계 및 시간", "교사 안내", "학생 수행", "학습 확인 방법"];
          assert.deepEqual(rows[0], headers);
          assert.equal(rows.length, 4);
          for (let i = 0; i < data.length; i++) {
            if (kind === "quiz") {
              assert.deepEqual(rows[i + 1], [String(i + 1), data[i].question, ...data[i].options, data[i].answer, data[i].explanation]);
            } else {
              const item = data[i], row = rows[i + 1];
              assert.equal(row.length, 7);
              assert.deepEqual([row[0], row[1], row[2], row[4], row[5], row[6]],
                [item.name, item.purpose, item.materials, item.teacherGuidance, item.studentTask, item.assessmentMethod]);
              for (const step of item.steps) {
                assert.ok(row[3].includes(step.description));
                assert.ok(row[3].includes(`${step.minutes}분`));
              }
            }
          }
        } finally { ui.cleanup(); }
      });
    }
