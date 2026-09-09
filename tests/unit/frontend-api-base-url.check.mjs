// Local URL-routing assertions; no real HTTP requests or additional dependencies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const read = path => readFileSync(new URL(path, root), "utf8");
const load = async source => {
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
};
const client = await load(read("packages/api-client-react/src/custom-fetch.ts"));
const paths = ["sessions", "conversations", "diagnostic-answers", "diagnose", "contacts", "consultant-chat"];
const originalFetch = globalThis.fetch;
let observed;
try {
  globalThis.fetch = async (url) => { observed = url; return Response.json({}); };
  for (const env of [undefined, "", "https://backend.example.test", "https://backend.example.test///"]) {
    const api = await load(read("apps/web/src/lib/api.ts")
      .replace("import.meta.env.VITE_API_BASE_URL", JSON.stringify(env) ?? "undefined"));
    client.setBaseUrl(api.API_BASE_URL);
    const base = env ? "https://backend.example.test" : "";
    for (const path of paths) {
      const expected = `${base}/api/${path}`;
      assert.equal(api.apiUrl(`/api/${path}`), expected);
      await api.apiFetch(`/api/${path}`);
      assert.equal(observed, expected);
      await client.customFetch(`/api/${path}`);
      assert.equal(observed, expected);
    }
  }
  const main = read("apps/web/src/main.tsx");
  assert.ok(main.indexOf("setBaseUrl(API_BASE_URL)") < main.indexOf("createRoot(document"));
  console.log("PASS: 6 API paths × 4 base URL configurations for helper and generated-client transport; zero real HTTP requests.");
} finally { globalThis.fetch = originalFetch; }
