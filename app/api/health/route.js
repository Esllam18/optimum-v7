const SCHEMA_HEAD = '20260810092938';

export const dynamic = 'force-dynamic';

export async function GET() {
  const release = String(
    process.env.OPTIMUM_RELEASE ||
    process.env.NEXT_PUBLIC_OPTIMUM_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'local'
  ).trim();

  return Response.json({
    ok: true,
    service: 'optimum-v7',
    runtime: 'next',
    release,
    schemaHead: SCHEMA_HEAD,
    timestamp: new Date().toISOString()
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Optimum-App': 'v7'
    }
  });
}
