# Optimum V7 — CI / Build / Deploy Handoff

Date: 2026-08-10

## Goal
Turn the V7 release process into a reproducible pipeline that proves the exact production runtime before public cutover.

## What is now in source control

### Production build format
`next.config.mjs` uses `output: 'standalone'`.

After `next build`, `npm run release:package` copies the required `public` and `.next/static` content into `.next/standalone` and writes `optimum-release.json` containing:
- application ID,
- release SHA/ID,
- build timestamp,
- Node version,
- V7 schema head,
- reviewed V7 migration list.

The resulting directory runs with:

```bash
HOSTNAME=0.0.0.0 PORT=3000 OPTIMUM_RELEASE=<release> node server.js
```

### Docker production runtime
The root `Dockerfile`:
- builds from the exact `package-lock.json` via `npm ci`,
- requires explicit public build variables,
- runs `next build`,
- packages only standalone traced output into the runtime stage,
- runs as non-root user `nextjs`,
- exposes port 3000,
- has a health check against `/api/health`.

### Machine health identity
`GET /api/health` returns a no-cache JSON response with:
- `service: optimum-v7`,
- `runtime: next`,
- release ID,
- expected V7 schema head `20260810221851`.

It also returns `X-Optimum-App: v7`.

### Build environment contract
`npm run release:env:strict` blocks a release build unless all are explicitly present and valid:
- `NEXT_PUBLIC_SUPABASE_URL`,
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
- `NEXT_PUBLIC_OPTIMUM_RELEASE`.

Only browser-safe publishable configuration is accepted. Service-role/secret keys remain forbidden from `NEXT_PUBLIC_*` and `.env.example`.

## GitHub Actions handoff

### `.github/workflows/v7-ci.yml`
Runs on PR/push/manual dispatch and proves:
1. exact `npm ci`,
2. complete V6.9 + V7 regression suite,
3. release preflight,
4. Chromium responsive/accessibility fixture matrix,
5. Next production build,
6. standalone artifact creation,
7. Docker production image build,
8. boot of the exact container,
9. `/api/health`,
10. post-deploy smoke against that container.

The ordinary CI workflow may use the reviewed public `.env.example` defaults when repository variables have not yet been entered. This is only for compile/runtime proof.

### `.github/workflows/v7-release-handoff.yml`
Manual staging/production gate. It is stricter than ordinary CI:
- attaches to a reviewed GitHub Environment,
- requires explicit public environment variables,
- reruns full regressions + visual matrix,
- builds the exact production artifact,
- uploads immutable standalone tarball,
- builds and smoke-tests the exact Docker image,
- optionally verifies an already-deployed HTTPS origin.

If `EXPECTED_RELEASE` is supplied, post-deploy smoke must observe that exact release ID from `/api/health`; an older but otherwise healthy V7 deployment therefore cannot pass.

## Post-deploy command

```bash
BASE_URL=https://app.example.com \
EXPECTED_RELEASE=<commit-sha> \
npm run release:postdeploy
```

The smoke checks:
- `/api/health` status/service/runtime/schema head/release identity,
- `/v7`,
- V7 marker,
- invitation route,
- favicon,
- required security headers.

## Current local evidence
- Workflow YAML files parse successfully.
- Strict release environment check passes when supplied the reviewed public V7 values.
- `npm run test:release` passes on this source tree.
- `npm run test:v7:visual` passes 11/11 cases.
- `npm run release:preflight` has one local blocker only: installed Next binary is missing.

## What is not yet claimed
The current execution container cannot resolve npm/public registries and has no installed Next binary. Therefore this checkpoint does **not** claim that `next build`, Docker build, or the GitHub workflows have executed successfully in a network-capable runner. The pipeline is prepared and contract-tested locally; its first external run remains a blocking release proof.
