import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const widget = readFileSync(new URL("apps/web/src/components/chat-widget.tsx", root), "utf8");
const home = readFileSync(new URL("apps/web/src/pages/home.tsx", root), "utf8");

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
assert.match(widget, /const handleStart = \(\) => \{\s*onDiagnosticStarted\?\.\(\);\s*showNextStep\(\);\s*setStep\(1\)/);
assert.ok(home.includes('src="/artem-expertovich.jpg"'));
assert.ok(home.includes("Артём Экспертович"));
assert.ok(home.includes("Персональный консультант ИНОБР"));
assert.ok(home.includes("Знания сегодня."));
assert.ok(home.includes('onClick={closeConsultation}'));
assert.ok(home.includes("<span>Закрыть</span>"));
assert.ok(widget.includes('<div className="diagnostic-launch__logo" aria-label="ИНОБР">'));
assert.ok(widget.includes('<ArrowUpRight aria-hidden="true" />'));
assert.ok(existsSync(new URL("apps/web/public/artem-expertovich.jpg", root)));

console.log("PASS: launch content/photo, existing start handler and close wiring.");
