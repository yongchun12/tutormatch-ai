import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { StudentLead } from "@/models/StudentLead";

export async function POST(req: Request) {
  try {
    // 1. Verify Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // 2. Parse payload
    const body = await req.json();
    const { subject, location, wantsNewsletter, remark } = body;

    if (!subject || !location) {
      return NextResponse.json({ error: "Subject and location are required." }, { status: 400 });
    }

    // 3. Connect DB & Save
    await dbConnect();
    const lead = await StudentLead.create({
      studentId: userId,
      subject,
      location,
      wantsNewsletter: !!wantsNewsletter,
      remark: remark || "",
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to save lead:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
