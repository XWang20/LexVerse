import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetType, targetName, agent, model, profile, attempts = 1, concurrency = 2 } = body;
    const repoRoot = path.resolve(process.cwd(), "..");

    const args = ["run"];
    if (targetType === "benchmark") {
      args.push("-b", targetName || "lawbench");
    } else {
      args.push("-p", targetName || "user_workspace/tasks/example");
    }
    if (agent) args.push("--agents", agent);
    if (model) args.push("--model", model);
    if (profile) args.push("--profile", profile);
    args.push("--attempts", String(attempts), "--concurrency", String(concurrency), "--print-config");

    const pythonBin = "/home/azureuser/lexverse/.venv/bin/python";
    const output = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(pythonBin, ["-m", "lexverse", ...args], {
        cwd: repoRoot,
        env: { ...process.env },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      child.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
    });

    return NextResponse.json({
      ok: output.code === 0,
      command: `lexverse ${args.join(" ")}`,
      exitCode: output.code,
      logs: (output.stderr + "\n" + output.stdout).trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to invoke lexverse CLI" }, { status: 400 });
  }
}
