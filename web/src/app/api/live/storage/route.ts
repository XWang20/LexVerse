import { NextRequest, NextResponse } from "next/server";
import { queryStoredTrials, scanStorageOverview } from "@/lib/storage-scanner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";
    const overview = scanStorageOverview(refresh);
    const initialTrials = queryStoredTrials({
      jobKey: searchParams.get("jobKey") || "all",
      taskName: searchParams.get("taskName") || "all",
      cohort: searchParams.get("cohort") || "all",
      arm: searchParams.get("arm") || "all",
      agent: searchParams.get("agent") || "all",
      q: searchParams.get("q") || "",
      page: Number(searchParams.get("page") || "1") || 1,
      pageSize: Number(searchParams.get("pageSize") || "12") || 12,
    });
    return NextResponse.json({
      ok: true,
      overview,
      initialTrials,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to scan LexVerse storage" },
      { status: 500 }
    );
  }
}
