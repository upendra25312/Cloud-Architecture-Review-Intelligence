export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  return Response.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.0.0",
    timestamp: new Date().toISOString(),
  });
}
