import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { syncCentreData } from "@/services/aiSyncService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    console.error("AI Sync Error:", error);
    return NextResponse.json(
      { error: "AI Sync failed", message: error.message },
      { status: 500 }
    );
  }
}
