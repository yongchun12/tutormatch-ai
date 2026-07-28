import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { SystemLog } from "@/models/SystemLog";
import { requireAdmin, authorizationErrorResponse } from "@/lib/authz";

/** Recent system logs for the admin dashboard's live feed (admin only). */
export async function GET() {
  try {
    await requireAdmin();

    await dbConnect();
    const rows = await SystemLog.find().sort({ createdAt: -1 }).limit(30).lean();
    const logs = rows.map((l: any) => ({
      id: String(l._id),
      level: l.level,
      source: l.source,
      message: l.message,
      createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
    }));
    return NextResponse.json({ logs });
  } catch (error) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("Admin logs error:", error);
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}
