import { NextRequest, NextResponse } from "next/server";
import { scanCapabilitiesCatalog } from "@/lib/storage-scanner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";
    const capabilities = scanCapabilitiesCatalog(refresh);
    return NextResponse.json({ ok: true, capabilities });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to scan LexVerse capabilities" },
      { status: 500 }
    );
  }
}
