import { NextRequest, NextResponse } from "next/server";
import { loadStoredTrialDetail } from "@/lib/storage-scanner";
import type { StorageRootId } from "@/lib/storage-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storageRoot = searchParams.get("storageRoot") as StorageRootId | null;
  const storagePath = searchParams.get("storagePath") || "";

  if ((storageRoot !== "upstream" && storageRoot !== "workspace") || !storagePath) {
    return NextResponse.json(
      { ok: false, error: "Invalid storageRoot or storagePath parameter" },
      { status: 400 }
    );
  }

  try {
    const trial = loadStoredTrialDetail(storageRoot, storagePath);
    if (!trial) {
      return NextResponse.json(
        { ok: false, error: "Trial trajectory not found or inaccessible" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, trial });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load trial detail" },
      { status: 500 }
    );
  }
}
