import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const config = read("apps/web/nginx/default.conf");
assert.match(config, /location \/ \{\s*try_files \$uri \$uri\/ \/index\.html;/);
assert.match(config, /location = \/api \{\s*return 404;/);
assert.match(config, /location \^~ \/api\/ \{\s*return 404;/);
assert.ok(!config.includes("proxy_pass"));
assert.ok(config.includes("root /usr/share/nginx/html;"));
assert.ok(config.includes("index index.html;"));
const dockerfile = read("apps/web/Dockerfile");
assert.ok(dockerfile.includes("COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf"));
assert.ok(dockerfile.includes("COPY --from=build /app/apps/web/dist/public/ /usr/share/nginx/html/"));
assert.ok(dockerfile.includes("RUN nginx -t"));
assert.ok(dockerfile.includes("pnpm --filter @workspace/chat-widget run build"));
const ignore = read("apps/web/Dockerfile.dockerignore");
assert.ok(ignore.includes("**/node_modules") && ignore.includes("**/.env.*"));
const app = read("apps/web/src/App.tsx");
assert.ok(app.includes('<Route path="/" component={Home} />'));
assert.ok(app.includes('<Route path="/tester" component={Tester} />'));
assert.ok(app.includes('<Route component={NotFound} />'));
const urlIndex = process.argv.indexOf("--url");
if (urlIndex >= 0) {
  const base = new URL(process.argv[urlIndex + 1]);
  assert.ok(["http:", "https:"].includes(base.protocol));
  let shell;
  for (const path of ["/", "/tester", "/tester", "/__spa_fallback_probe__"]) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000), cache: "no-store" });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /id=["']root["']/);
    if (shell === undefined) shell = html; else assert.equal(html, shell, path);
  }
  for (const path of ["/api", "/api/sessions"]) {
    assert.equal((await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })).status, 404, path);
  }
  console.log("PASS: deployed HTTP /, /tester, refresh, unknown route and API isolation. React rendering requires browser verification.");
} else console.log("PASS: image COPY wiring, nginx root/index/fallback, API isolation and React routes. Docker/live deployment not tested.");
