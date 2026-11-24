import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const isStatic = process.env.STATIC_EXPORT === "1";
  if (isStatic) {
    return NextResponse.json({
      ok: true,
      mode: "static",
      runtime: "Static Export (GitHub Pages)",
    });
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const runsDir = path.join(repoRoot, "runs");
  const configsDir = path.join(repoRoot, "configs/jobs");
  const hasRuns = fs.existsSync(runsDir);
  const runCount = hasRuns ? fs.readdirSync(runsDir).filter((f) => !f.startsWith(".")).length : 0;
  const configCount = fs.existsSync(configsDir)
    ? fs.readdirSync(configsDir).filter((f) => f.endsWith(".yaml")).length
    : 0;

  return NextResponse.json({
    ok: true,
    mode: "serve",
    runtime: typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`,
    repoRoot,
    runCount,
    configCount,
    capabilitiesReady: fs.existsSync(path.join(repoRoot, ".lexverse/capabilities/indexes")),
  });
}
