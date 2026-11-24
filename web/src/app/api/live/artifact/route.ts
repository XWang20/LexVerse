import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { canRead, resolveSafeStoragePath, safeStat } from "@/lib/storage-scanner";
import type { StorageRootId } from "@/lib/storage-types";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storageRoot = searchParams.get("storageRoot") as StorageRootId | null;
  const storagePath = searchParams.get("storagePath") || "";

  if ((storageRoot !== "upstream" && storageRoot !== "workspace") || !storagePath) {
    return NextResponse.json(
      { ok: false, error: "Invalid storageRoot or storagePath" },
      { status: 400 }
    );
  }

  const safe = resolveSafeStoragePath(storageRoot, storagePath);
  if (!safe) {
    return NextResponse.json(
      { ok: false, error: "Path outside permitted run storage" },
      { status: 403 }
    );
  }

  if (safe.relClean.includes("/.internal/")) {
    return NextResponse.json(
      { ok: false, error: "Internal runtime files cannot be downloaded via this endpoint" },
      { status: 403 }
    );
  }

  const st = safeStat(safe.absPath);
  if (!st || !st.isFile() || !canRead(safe.absPath)) {
    return NextResponse.json(
      { ok: false, error: "Stored artifact not found" },
      { status: 404 }
    );
  }

  if (st.size > 40 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "File exceeds direct download size limit (40 MB)" },
      { status: 413 }
    );
  }

  const ext = path.extname(safe.absPath).toLowerCase();
  const contentType = MIME_MAP[ext] || "application/octet-stream";
  const fileName = path.basename(safe.absPath);
  const bytes = fs.readFileSync(safe.absPath);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
