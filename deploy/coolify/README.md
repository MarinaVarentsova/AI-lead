# Frontend image: repository-owned SPA fallback

Use `apps/web/Dockerfile` instead of the Nixpacks/static wrapper. The final nginx
stage copies `apps/web/nginx/default.conf` to `/etc/nginx/conf.d/default.conf`
and validates it with `RUN nginx -t`. It contains only built frontend assets and
the committed server configuration. Backend code/settings remain unchanged.

## Current Coolify settings (frontend resource only)

- Branch: `inobr-v2`; Build Pack: **Dockerfile**.
- Base Directory / build context: repository root `/`.
- Dockerfile Location: `/apps/web/Dockerfile`; leave build stage empty.
- Container port: `80`; keep the existing frontend domain.
- Pass existing `VITE_API_BASE_URL` as a build argument pointing to the backend.
  Leave `BASE_PATH=/`. Never pass backend or tester secrets as build arguments.
- Do not use the Static wrapper, Custom Nginx Configuration, an nginx config
  volume mount or a start command overriding the image CMD.
- Redeploy after switching build packs. A Git push alone cannot change a resource
  still configured as Nixpacks/static. No Coolify settings were changed here.

Official deployment guide: https://coolify.io/docs/applications/build-packs/dockerfile

From repository root (Docker required):

```sh
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=https://YOUR-BACKEND -t inobr-web .
docker run --rm inobr-web nginx -T
docker run --rm -p 8085:80 --name inobr-web-check inobr-web
```

Then run `node tests/unit/spa-fallback.check.mjs --url http://localhost:8085`.
Without `--url`, only static image/config/route checks are performed, not Docker.
`/`, `/tester`, refresh and unknown SPA paths return index.html; `/api` stays 404.

## Legacy manual setup (superseded; do not use for the Dockerfile deployment)

This repository contains React source. Keep Nixpacks and **Is it a static site?**
enabled, with the existing build command and Publish Directory pointing to the
built `apps/web/dist/public` (relative to the configured Base Directory).
Do not switch build packs or change backend settings.

## Apply once in Coolify

1. Open the **frontend application** → Configuration → General → Nginx Configuration.
2. Generate the default configuration if the editor is empty.
3. Inside the existing `server` block, replace `location /` with the contents of
   `frontend-spa-locations.conf`. Do not duplicate locations. Preserve generated
   `listen`, `root`, `index` and other server settings.
4. Save and **redeploy** frontend. A restart alone does not rebuild the static image.

Coolify stores this configuration in its application settings and copies it into
its nginx image. It does **not** automatically consume this repository snippet.
A Git push alone therefore does not enable the fallback on the running site.
No Coolify settings were changed by committing these files.

`try_files $uri $uri/ /index.html` serves existing assets first and falls back to
React for unknown paths. `/tester` remains the existing React route, including its
access screen. Unknown frontend paths reach the existing React NotFound component.
`/api` and `/api/*` explicitly remain 404 on frontend nginx; API calls continue to
use the configured separate backend domain. No proxy_pass is added.

Official deployment behaviour:
https://coolify.io/docs/applications/builds/static#nginx-configuration

## Verify after redeploy

Run from repository root:

```sh
node tests/unit/spa-fallback.check.mjs --url http://inobr-assistant.161.104.50.164.sslip.io
```

This checks GET `/`, two independent GETs `/tester` (direct navigation and refresh),
and an unknown frontend path: each must return HTTP 200 and the same SPA HTML.
It also verifies `/api` and `/api/sessions` are 404 on this frontend domain.
Then open `/tester`, refresh it, and open `/__spa_fallback_probe__` in a browser:
the latter must display React NotFound. The HTTP check cannot validate React rendering.
Without `--url`, the script only checks the committed config and React route wiring;
it does not claim to run nginx. Existing frontend typecheck:
`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit`.
