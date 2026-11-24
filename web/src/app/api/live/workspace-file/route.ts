import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { resolveSafeWorkspaceFile, safeReadText, safeStat } from "@/lib/storage-scanner";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");
  const relPath = searchParams.get("path") || "";
  const download = searchParams.get("download") === "1";
  const inline = searchParams.get("inline") === "1";

  if ((scope !== "task" && scope !== "config") || !relPath) {
    return NextResponse.json(
      { ok: false, error: "Invalid scope or path parameter" },
      { status: 400 }
    );
  }

  const resolved = resolveSafeWorkspaceFile(scope, relPath);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Workspace path not found or forbidden" },
      { status: 403 }
    );
  }

  const st = safeStat(resolved.absPath);
  if (!st || st.size > 40 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "File exceeds limit" }, { status: 413 });
  }

  if (download || inline) {
    const ext = path.extname(resolved.absPath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";
    const fileName = path.basename(resolved.absPath);
    const bytes = fs.readFileSync(resolved.absPath);
    const disp = inline && !download ? "inline" : "attachment";
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  }

  const content = safeReadText(resolved.absPath, 64 * 1024);
  return NextResponse.json({
    ok: true,
    relPath: resolved.relClean,
    sizeBytes: st.size,
    content,
  });
}
