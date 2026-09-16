import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const widget = readFileSync(new URL("apps/web/src/components/chat-widget.tsx", root), "utf8");
const home = readFileSync(new URL("apps/web/src/pages/home.tsx", root), "utf8");
const styles = readFileSync(new URL("apps/web/src/index.css", root), "utf8");

for (const content of [
  "00 / 04",
  "Подберём программу",
  "под ваш опыт и цели",
  "Ответьте на 4 коротких вопроса — Артём подготовит предварительную рекомендацию.",
  "Начать диагностику",
  "Актуальные",
  "программы",
  "Под ваш опыт",
  "Рекомендации",
  "от эксперта",
]) assert.ok(widget.includes(content), `missing launch content: ${content}`);

assert.match(widget, /onClick=\{handleStart\}/);
assert.match(widget, /const handleStart = \(\) => \{\s*if \(!sessionId \|\| diagnosticSchema\.length !== 4\) return;\s*onDiagnosticStarted\?\.\(\)/);
assert.ok(!widget.includes("Здравствуйте."));
assert.ok(!widget.includes('data-testid="button-begin-questions"'));
assert.ok(!widget.includes("handleBeginQuestions"));
assert.ok(home.includes('src="/artem-expertovich.jpg"'));
assert.ok(home.includes("Артём Экспертович"));
assert.ok(home.includes("Персональный консультант ИНОБР"));
assert.ok(home.includes("Знания сегодня."));
assert.ok(home.includes('onClick={closeConsultation}'));
assert.ok(home.includes("<span>Закрыть</span>"));
assert.ok(widget.includes('<div className="diagnostic-launch__logo" aria-label="ИНОБР">'));
assert.ok(widget.includes('<ArrowUpRight aria-hidden="true" />'));
assert.ok(existsSync(new URL("apps/web/public/artem-expertovich.jpg", root)));
assert.match(styles, /\.consultation-modal--launch,[\s\S]*?\.consultation-modal--diagnostic\s*\{[\s\S]*?width:\s*min\(1150px,[\s\S]*?height:\s*min\(600px/);
assert.match(styles, /\.diagnostic-launch__copy h1\s*\{[\s\S]*?font-size:\s*52px/);
assert.match(styles, /\.diagnostic-launch__copy p\s*\{[^}]*font-size:\s*19px/);
assert.match(styles, /\.diagnostic-launch__button\s*\{[\s\S]*?min-height:\s*70px[^}]*font-size:\s*18px/);
assert.match(styles, /\.diagnostic-launch-person__card img\s*\{[\s\S]*?height:\s*286px/);
assert.ok(widget.includes("<ProgressBar current={displayedQIndex + 1} total={4} />"));
assert.ok(widget.includes("{displayedQuestion.questionText}"));
assert.ok(widget.includes("const dictItems = q.options"));
assert.ok(widget.includes('aria-pressed={selectedCode === opt.code}'));
assert.ok(widget.includes("handleDiagnosticBack(displayedQIndex)"));
assert.ok(widget.includes("handleDiagnosticNext(displayedQIndex)"));
assert.ok(widget.includes("pendingAnswer.code !== \"other\" || customInput.trim()"));
assert.match(styles, /\.diagnostic-question__options > button\.is-selected\s*\{[^}]*background:\s*#f2b631/);
assert.ok(home.includes('!diagnosticCompleted ? " consultation-modal--diagnostic"'));

console.log("PASS: launch content/photo, existing start handler and close wiring.");
