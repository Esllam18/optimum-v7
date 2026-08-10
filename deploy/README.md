# Optimum V7 deployment handoff

The release artifact is a Next.js standalone server. It can run directly with Node or through the provided Dockerfile.

## Required public build variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_OPTIMUM_RELEASE` (commit SHA / release ID)

These values are browser-visible by design. Never place service-role or secret keys in `NEXT_PUBLIC_*` variables.

## Edge/Auth production configuration

Before using invitations on a deployed origin:

1. Configure the Edge Function secret `OPTIMUM_APP_URL=https://<final-origin>` or `OPTIMUM_ALLOWED_ORIGINS` for the approved origins.
2. Add the same V7 origin to Supabase Auth URL Configuration / Additional Redirect URLs.
3. Run a real invited-user click-through before public cutover.

## Standalone artifact

After a successful build:

```bash
npm run release:package
tar -C .next/standalone -czf optimum-v7-standalone.tgz .
```

On the target host:

```bash
tar -xzf optimum-v7-standalone.tgz
HOSTNAME=0.0.0.0 PORT=3000 OPTIMUM_RELEASE=<release-id> node server.js
```

Then run from a trusted machine:

```bash
BASE_URL=https://<final-origin> npm run release:postdeploy
```

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --build-arg NEXT_PUBLIC_OPTIMUM_RELEASE="$RELEASE_SHA" \
  -t optimum-v7:$RELEASE_SHA .

docker run --rm -p 3000:3000 -e OPTIMUM_RELEASE="$RELEASE_SHA" optimum-v7:$RELEASE_SHA
```

The production image runs as a non-root user and serves the traced standalone output only.
