import { useEffect, useRef, useState } from "react";
import { testerRequest as request, getTesterToken, saveTesterToken, clearTesterToken, TESTER_UNAUTHORIZED_EVENT } from "@/lib/tester-access";
type Evaluation = { score: number; verdict: string; strengths: string[]; problems: string[]; recommendedFixes: string[]; funnelAssessment: string; groundingAssessment: string };
type TestCase = { id: string; caseNumber: number; persona: { label: string }; diagnosticAnswers: unknown; diagnosticResult: unknown;
  transcript: { role: string; message: string }[] | null; evaluatorResult: Evaluation | null; score: number | null; verdict: string; errorMessage: string | null };
type Summary = { totalCases: number; PASS: number; REVIEW: number; FAIL: number; averageScore: number | null;
  averageQualificationScore: number | null; averageGroundingScore: number | null; averageSalesFunnelScore: number | null;
  evaluatedCases: number; errorCases: number; error?: string; summaryError?: string;
  aiSummary?: { topProblems: string[]; topStrengths: string[]; conversionImprovements: string[] } | null };
type Run = { id: string; status: string; requestedCases: number; completedCases: number; knowledgeVersion: string; summary: Summary | null };
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
        const result = await request<{ run: Run; cases: TestCase[] }>(`/api/tester/runs/${run.id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRun(result.run); setCases(result.cases); setError("");
        if (result.run.status === "running") timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!controller.signal.aborted) { setError((error as Error).message); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run?.id]);
  const start = async () => {
    if (busy.current || initializing || run?.status === "running" || count < 1 || count > 10) return;
    busy.current = true; setStarting(true); setError("");
    try {
      setRun(await request<Run>("/api/tester/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) }));
      setCases([]);
    } catch (error) {
      setError((error as Error).message);
      // Recover a run accepted before a lost HTTP acknowledgement; never auto-retry POST.
      try { const runs = await request<Run[]>("/api/tester/runs"); if (runs[0]) setRun(runs[0]); } catch { /* keep the original error */ }
    } finally { busy.current = false; setStarting(false); }
  };
  const summary = run?.summary;
  return <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-5">
    <h1 className="text-2xl font-semibold">Тестировщик Артёма</h1>
    <p className="text-sm text-muted-foreground">Внутренний MVP. Запуск выполняет платные AI-вызовы. Не используйте персональные данные. Доступ защищён внутренним ключом.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <label>Кейсов <input aria-label="Количество тестов" type="number" min={1} max={10} value={count}
        disabled={initializing || starting || run?.status === "running"} onChange={event => setCount(Number(event.target.value))} className="border rounded p-2 w-20" /></label>
      <button onClick={() => void start()} disabled={initializing || starting || run?.status === "running" || !Number.isInteger(count) || count < 1 || count > 10}
        className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50">{starting ? "Запускаем…" : `Запустить ${count} тестов`}</button>
    </div>
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    {run && <section className="border rounded p-4 space-y-2" aria-live="polite">
      <p>Статус: {run.status} · {run.completedCases} / {run.requestedCases}</p>
      <progress className="w-full" max={run.requestedCases} value={run.completedCases} />
      <p className="text-xs break-all">Run: {run.id} · KB: {run.knowledgeVersion}</p>
      {summary && <>
        <p>Всего: {summary.totalCases ?? run.completedCases} · PASS: {summary.PASS ?? 0} · REVIEW: {summary.REVIEW ?? 0} · FAIL: {summary.FAIL ?? 0}</p>
        <p>Средний балл: {summary.averageScore ?? "—"} · Квалификация: {summary.averageQualificationScore ?? "—"} · KB: {summary.averageGroundingScore ?? "—"} · Продажи/воронка: {summary.averageSalesFunnelScore ?? "—"}</p>
        <p>Оценено AI: {summary.evaluatedCases ?? 0} · Ошибок: {summary.errorCases ?? 0}. Средние рассчитаны только по полученным оценкам.</p>
        {(summary.error || summary.summaryError) && <p>{summary.error || summary.summaryError}</p>}
        {summary.aiSummary && <>{([ ["Топ-3 системных проблемы Артёма", summary.aiSummary.topProblems], ["Топ-3 сильные стороны", summary.aiSummary.topStrengths],
          ["Изменения для роста конверсии", summary.aiSummary.conversionImprovements] ] as const).map(([title, items]) => <div key={title}><h2 className="font-semibold">{title}</h2><ul className="list-disc pl-5">{items.map((item,i) => <li key={i}>{item}</li>)}</ul></div>)}</>}
      </>}
    </section>}
    {cases.map(item => <details key={item.id} className="border rounded p-4">
      <summary className="cursor-pointer font-semibold">Test #{item.caseNumber} · {item.persona.label} · {item.verdict} · {item.score ?? "ошибка"}</summary>
      <div className="space-y-3 mt-4 break-words">
        <h3>Diagnostic answers</h3><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(item.diagnosticAnswers, null, 2)}</pre>
        <h3>Artem recommendation</h3><pre className="whitespace-pre-wrap text-sm">{JSON.stringify(item.diagnosticResult, null, 2)}</pre>
        <h3>Conversation transcript</h3>{item.transcript?.map((line,i) => <p key={i} className="whitespace-pre-wrap"><strong>{line.role === "user" ? "Кандидат" : "Артём"}: </strong>{line.message}</p>)}
        {item.errorMessage && <p role="alert">{item.errorMessage}</p>}
        {item.evaluatorResult && <>
          <p>{item.evaluatorResult.funnelAssessment}</p><p>{item.evaluatorResult.groundingAssessment}</p>
          {([ ["Сильные стороны", item.evaluatorResult.strengths], ["Проблемы", item.evaluatorResult.problems], ["Рекомендуемые исправления", item.evaluatorResult.recommendedFixes] ] as const)
            .map(([title, items]) => <div key={title}><h3 className="font-semibold">{title}</h3><ul className="list-disc pl-5">{items.map((text,i) => <li key={i}>{text}</li>)}</ul></div>)}
        </>}
      </div>
    </details>)}
  </main>;
}
