import { useEffect, useRef, useState } from "react";
import { testerRequest as request, getTesterToken, saveTesterToken, clearTesterToken, TESTER_UNAUTHORIZED_EVENT } from "@/lib/tester-access";
import { verdictLabel, runStatusLabel, errorLabel, areaLabel, severityLabel, type RunAssessmentView } from "@/lib/tester-report";
type Evaluation = { score: number; verdict: string; strengths: string[]; problems: string[]; recommendedFixes: string[]; funnelAssessment: string; groundingAssessment: string };
type TestCase = { id: string; caseNumber: number; persona: { label: string }; diagnosticAnswers: unknown; diagnosticResult: unknown;
  transcript: { role: string; message: string }[] | null; evaluatorResult: Evaluation | null; score: number | null; verdict: string; errorMessage: string | null };
type Summary = { totalCases: number; PASS: number; REVIEW: number; FAIL: number; averageScore: number | null;
  averageQualificationScore: number | null; averageGroundingScore: number | null; averageSalesFunnelScore: number | null;
  evaluatedCases: number; errorCases: number; error?: string; summaryError?: string;
  runEvaluation?: RunAssessmentView | null; codexTask?: string; TECH_ERROR?: number };
type Run = { id: string; status: string; requestedCases: number; completedCases: number; knowledgeVersion: string; summary: Summary | null; parentRunId?: string | null; iterationNumber?: number };
export default function Tester() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getTesterToken()));
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  useEffect(() => {
    const denied = () => { setUnlocked(false); setKey(""); setError("Ключ доступа отсутствует или неверен."); };
    window.addEventListener(TESTER_UNAUTHORIZED_EVENT, denied);
    return () => window.removeEventListener(TESTER_UNAUTHORIZED_EVENT, denied);
  }, []);
  if (unlocked) return <TesterPanel />;
  return <main className="max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Внутренний тестировщик Артёма</h1>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (checkingRef.current || !key.trim()) return;
      checkingRef.current = true; setChecking(true); setError("");
      try {
        saveTesterToken(key.trim()); setKey("");
        await request("/api/tester/runs");
        setUnlocked(true);
      } catch (error) { clearTesterToken(); setError((error as Error).message); }
      finally { checkingRef.current = false; setChecking(false); }
    }}>
      <label className="block">Ключ доступа
        <input type="password" aria-label="Ключ доступа" autoComplete="off" value={key}
          disabled={checking} onChange={event => setKey(event.target.value)} className="block w-full border rounded p-2 mt-1" />
      </label>
      <button disabled={checking || !key.trim()} className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50">Открыть тестировщик</button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </form>
  </main>;
}
function TesterPanel() {
  const [run, setRun] = useState<Run | null>(null);
  const [parentRun, setParentRun] = useState<Run | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [cases, setCases] = useState<TestCase[]>([]);
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    request<Run[]>("/api/tester/runs", { signal: controller.signal }).then(runs => setRun(runs[0] ?? null))
      .catch(error => { if (!controller.signal.aborted) setError(String(error.message)); })
      .finally(() => { if (!controller.signal.aborted) setInitializing(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!run) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<{ run: Run; cases: TestCase[]; parentRun: Run | null }>(`/api/tester/runs/${run.id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRun(result.run); setCases(result.cases); setParentRun(result.parentRun); setError("");
        if (result.run.status === "running") timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!controller.signal.aborted) { setError((error as Error).message); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run?.id]);
  const start = async (parentRunId?: string) => {
    if (busy.current || initializing || run?.status === "running" || count < 1 || count > 10) return;
    busy.current = true; setStarting(true); setError("");
    try {
      setRun(await request<Run>("/api/tester/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, parentRunId }) }));
      setCases([]); setParentRun(null); setCopyStatus("");
    } catch (error) {
      setError((error as Error).message);
      // Recover a run accepted before a lost HTTP acknowledgement; never auto-retry POST.
      try { const runs = await request<Run[]>("/api/tester/runs"); if (runs[0]) setRun(runs[0]); } catch { /* keep the original error */ }
    } finally { busy.current = false; setStarting(false); }
  };
  const summary = run?.summary;
  const assessment = summary?.runEvaluation;
  const codexTask = assessment?.codexTask ?? summary?.codexTask;
  return <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-5">
    <h1 className="text-2xl font-semibold">Тестировщик Артёма</h1>
    <p className="text-sm text-muted-foreground">Внутренний MVP. Запуск выполняет платные AI-вызовы. Не используйте персональные данные. Доступ защищён внутренним ключом.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <label>Кейсов <input aria-label="Количество тестов" type="number" min={1} max={10} value={count}
        disabled={initializing || starting || run?.status === "running"} onChange={event => setCount(Number(event.target.value))} className="border rounded p-2 w-20" /></label>
      <button onClick={() => void start()} disabled={initializing || starting || run?.status === "running" || !Number.isInteger(count) || count < 1 || count > 10}
        className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50">{starting ? "Запускаем…" : `Запустить ${count} тестов`}</button>
      {run?.status === "completed" && <button onClick={() => void start(run.id)}
        disabled={starting || (run.iterationNumber ?? 1) >= 5} className="border px-4 py-2 rounded disabled:opacity-50">
        {(run.iterationNumber ?? 1) >= 5 ? "Достигнут предел 5 серий" : "Продолжить на тех же сценариях"}
      </button>}
    </div>
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    {run && <section className="border rounded p-4 space-y-2" aria-live="polite">
      <p>Серия {run.iterationNumber ?? 1} из 5 · {runStatusLabel(run.status)} · {run.completedCases} / {run.requestedCases}</p>
      <progress className="w-full" max={run.requestedCases} value={run.completedCases} />
      <p className="text-xs break-all">Серия: {run.id} · Версия базы знаний: {run.knowledgeVersion}</p>
      {summary && <>
        <p>Всего: {summary.totalCases ?? run.completedCases} · Пройдено: {summary.PASS ?? 0} · Требует внимания: {summary.REVIEW ?? 0} · Провалено по качеству: {summary.FAIL ?? 0}</p>
        <p>Средний балл: {summary.averageScore ?? "—"} · Квалификация: {summary.averageQualificationScore ?? "—"} · KB: {summary.averageGroundingScore ?? "—"} · Продажи/воронка: {summary.averageSalesFunnelScore ?? "—"}</p>
        <p>Оценено AI: {summary.evaluatedCases ?? 0} · Технических ошибок: {summary.TECH_ERROR ?? summary.errorCases ?? 0}. Средние рассчитаны только по полученным оценкам.</p>
        {(summary.error || summary.summaryError) && <p>{errorLabel(summary.error || summary.summaryError || "")}</p>}
        {parentRun?.summary && <div className="border-t pt-3">
          <h2 className="font-semibold">Изменение относительно предыдущей серии</h2>
          <p>Общий балл: {parentRun.summary.averageScore ?? "—"} → {summary.averageScore ?? "—"}</p>
          <p>База знаний: {parentRun.summary.averageGroundingScore ?? "—"} → {summary.averageGroundingScore ?? "—"}</p>
          <p>Продажи/воронка: {parentRun.summary.averageSalesFunnelScore ?? "—"} → {summary.averageSalesFunnelScore ?? "—"}</p>
          <p>Провалов по качеству: {parentRun.summary.FAIL ?? 0} → {summary.FAIL ?? 0}</p>
          <p className="text-sm">Оценено: {parentRun.summary.evaluatedCases ?? 0} → {summary.evaluatedCases ?? 0}. При разном числе оценок сравнение ограничено.</p>
        </div>}
      </>}
    </section>}
    {run?.status === "completed" && <section className="border-2 border-primary rounded p-5 space-y-4">
      <h2 className="text-xl font-semibold">Итоговое заключение руководителя отдела продаж</h2>
      {assessment ? <>
        <p>{assessment.executiveSummary}</p>
        <p>Общий балл: {assessment.overallScore} · Квалификация: {assessment.qualificationScore} · База знаний: {assessment.knowledgeGroundingScore} · Продажи/воронка: {assessment.salesFunnelScore}</p>
        <h3 className="font-semibold">Системные проблемы</h3>
        {assessment.systemicProblems.map((problem,i) => <article key={i} className="border rounded p-3 space-y-1">
          <h4 className="font-semibold">{problem.title}</h4><p>Важность: {severityLabel(problem.severity)} · Сценарии: {problem.evidenceCaseNumbers.join(", ")}</p>
          <p>{problem.description}</p><p>Влияние на бизнес: {problem.businessImpact}</p>
        </article>)}
        <h3 className="font-semibold">Рекомендуемые изменения</h3>
        {assessment.recommendedChanges.map((change,i) => <article key={i} className="border rounded p-3 space-y-1">
          <p>Приоритет {change.priority} · {areaLabel(change.area)}</p><p>{change.problem}</p><p>{change.change}</p><p>Ожидаемый эффект: {change.expectedEffect}</p>
        </article>)}
        {([ ["Сильные стороны", assessment.strengths], ["Что не менять", assessment.doNotChange] ] as const).map(([title, items]) =>
          <div key={title}><h3 className="font-semibold">{title}</h3><ul className="list-disc pl-5">{items.map((item,i) => <li key={i}>{item}</li>)}</ul></div>)}
      </> : <p>{errorLabel(summary?.summaryError ?? "AI_SUMMARY_UNAVAILABLE")}</p>}
      {codexTask && <div className="space-y-2"><h3 className="font-semibold">Задача для Codex</h3>
        <p className="text-sm">Это предложение для проверки. Codex и новая серия автоматически не запускаются.</p>
        <textarea readOnly value={codexTask} aria-label="Задача для Codex" className="w-full min-h-64 border rounded p-3" />
        <button className="border rounded p-2" onClick={async () => {
          try { await navigator.clipboard.writeText(codexTask); setCopyStatus("Задача скопирована"); }
          catch { setCopyStatus("Копирование недоступно. Выделите и скопируйте текст вручную."); }
        }}>Скопировать задачу для Codex</button><p role="status">{copyStatus}</p>
      </div>}
    </section>}
    {cases.map(item => <details key={item.id} className="border rounded p-4">
      <summary className="cursor-pointer font-semibold">Сценарий №{item.caseNumber} · {item.persona.label} · {verdictLabel(item.verdict)} · {item.score ?? "без оценки"}</summary>
      <div className="space-y-3 mt-4 break-words">
        <details><summary>Ответы диагностики — технические коды</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(item.diagnosticAnswers, null, 2)}</pre></details>
        <details><summary>Рекомендация Артёма — технические данные</summary><pre className="whitespace-pre-wrap text-sm">{JSON.stringify(item.diagnosticResult, null, 2)}</pre></details>
        <h3>Диалог и рекомендация</h3>{item.transcript?.map((line,i) => <p key={i} className="whitespace-pre-wrap"><strong>{line.role === "user" ? "Кандидат" : "Артём"}: </strong>{line.message}</p>)}
        {item.errorMessage && <p role="alert">{errorLabel(item.errorMessage)}</p>}
        {item.evaluatorResult && <>
          <p>{item.evaluatorResult.funnelAssessment}</p><p>{item.evaluatorResult.groundingAssessment}</p>
          {([ ["Сильные стороны", item.evaluatorResult.strengths], ["Проблемы", item.evaluatorResult.problems], ["Рекомендуемые исправления", item.evaluatorResult.recommendedFixes] ] as const)
            .map(([title, items]) => <div key={title}><h3 className="font-semibold">{title}</h3><ul className="list-disc pl-5">{items.map((text,i) => <li key={i}>{text}</li>)}</ul></div>)}
        </>}
      </div>
    </details>)}
  </main>;
}
