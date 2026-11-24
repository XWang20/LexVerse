import { NextRequest, NextResponse } from "next/server";
import { queryStoredTrials } from "@/lib/storage-scanner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = queryStoredTrials({
      jobKey: searchParams.get("jobKey") || "all",
      taskName: searchParams.get("taskName") || "all",
      cohort: searchParams.get("cohort") || "all",
      agent: searchParams.get("agent") || "all",
      arm: searchParams.get("arm") || "all",
      status: searchParams.get("status") || "all",
      q: searchParams.get("q") || "",
      page: Number(searchParams.get("page") || "1") || 1,
      pageSize: Number(searchParams.get("pageSize") || "12") || 12,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to query stored trials" },
      { status: 500 }
    );
  }
}
