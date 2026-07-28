import { NextResponse } from "next/server";
import { requireAdmin, authorizationErrorResponse } from "@/lib/authz";
import { syncCentreData } from "@/services/aiSyncService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const resolvedParams = await params;
    const { id } = resolvedParams;
    if (!id) {
      return NextResponse.json({ error: "Missing centre ID" }, { status: 400 });
    }

    const result = await syncCentreData(id);

    return NextResponse.json({
      success: true,
      message: "Data synced successfully via AI",
      data: result
    });
  } catch (error: any) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("AI Sync Error:", error);
    return NextResponse.json(
      { error: "AI Sync failed", message: error.message },
      { status: 500 }
    );
  }
}
