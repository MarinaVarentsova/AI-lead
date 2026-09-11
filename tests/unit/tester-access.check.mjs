import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const read = path => readFileSync(new URL(path, root), "utf8");
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64");
const saved = { enabled: process.env.INTERNAL_TESTER_ENABLED, token: process.env.INTERNAL_TESTER_TOKEN, fetch: globalThis.fetch };
try {
  const { internalTesterAccess } = await import(moduleUrl(read("apps/api/src/tester/access.ts")));
  for (const [enabled, configured, supplied, expected] of [
    ["false", "secret", "secret", 404], ["true", "", "", 401], ["true", "   ", "anything", 401],
    ["true", "secret", undefined, 401], ["true", "secret", "wrong", 401], ["true", "secret", "long-wrong-value", 401],
    ["true", "secret", "secret", 200], ["true", "unicode-ключ", "unicode-ключ", 200],
  ]) {
    process.env.INTERNAL_TESTER_ENABLED = enabled; process.env.INTERNAL_TESTER_TOKEN = configured;
    let called = false;
    const res = { code: 200, status(n) { this.code = n; return this; }, json() {} };
    internalTesterAccess({ get(name) { assert.equal(name, "X-Internal-Tester-Token"); return supplied; } }, res, () => { called = true; });
    assert.equal(res.code, expected); assert.equal(called, expected === 200);
  }
  const routes = read("apps/api/src/routes/tester.ts");
  assert.ok(routes.indexOf('router.use("/tester", internalTesterAccess)') < routes.indexOf('router.post('));
  const index = read("apps/api/src/routes/index.ts");
  assert.ok(!index.includes("internalTesterAccess"));
  for (const path of ["health", "diagnose", "consultant-chat", "contacts"]) assert.ok(!read(`apps/api/src/routes/${path}.ts`).includes("internalTesterAccess"));
  const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) };
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  const api = moduleUrl(read("apps/web/src/lib/api.ts").replace("import.meta.env.VITE_API_BASE_URL", '"https://api.example.test"'));
  const source = read("apps/web/src/lib/tester-access.ts");
  const { testerRequest, saveTesterToken, getTesterToken } = await import(moduleUrl(source.replace('"./api"', JSON.stringify(api))));
  saveTesterToken("test-secret");
  for (const path of ["/api/tester/runs", "/api/tester/runs/run-id"]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, `https://api.example.test${path}`); assert.ok(!url.includes("test-secret"));
      assert.equal(options.headers.get("X-Internal-Tester-Token"), "test-secret");
      assert.equal(options.redirect, "error"); return Response.json({ ok: true });
    };
    assert.deepEqual(await testerRequest(path), { ok: true });
  }
  await assert.rejects(testerRequest("/api/contacts"));
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(testerRequest("/api/tester/runs"));
  assert.equal(getTesterToken(), null); assert.deepEqual(events, ["inobr:tester-unauthorized"]);
  globalThis.fetch = async () => { throw Error("must not call API without key"); };
  await assert.rejects(testerRequest("/api/tester/runs"), { name: "Error", message: "Ключ доступа отсутствует или неверен." });
  assert.ok(!source.includes("localStorage")); assert.ok(!source.includes("import.meta.env"));
  const page = read("apps/web/src/pages/tester.tsx");
  assert.ok(page.includes('type="password"')); assert.ok(page.includes('setUnlocked(false)'));
  assert.ok(!page.includes("localStorage") && !page.includes("apiFetch"));
  assert.ok(read("apps/api/src/lib/logger.ts").includes("x-internal-tester-token"));
  console.log("PASS: 8 backend access cases; tester-only mount; header/sessionStorage/401 reset; no URL/localStorage token; logger redaction.");
} finally {
  for (const [key,value] of [["INTERNAL_TESTER_ENABLED", saved.enabled], ["INTERNAL_TESTER_TOKEN", saved.token]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  globalThis.fetch = saved.fetch;
  delete globalThis.sessionStorage; delete globalThis.window;
}
