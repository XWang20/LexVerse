import { NextResponse } from "next/server";
import { scanHarborWorkspace } from "@/lib/storage-scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = scanHarborWorkspace();
    return NextResponse.json({ ok: true, workspace });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to scan Harbor workspace" },
      { status: 500 }
    );
  }
}
