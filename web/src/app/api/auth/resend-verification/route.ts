import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { generateToken, VERIFICATION_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

/**
 * Re-sends an activation email. Always responds with the same generic message
 * so it can't be used to probe which emails are registered.
 */
export async function POST(req: Request) {
  const generic = NextResponse.json({
    message: "If that account exists and isn't verified yet, a new activation link is on its way.",
  });

  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findOne({ email });

    if (user && user.emailVerified === false) {
      const { raw, hashed } = generateToken();
      user.verificationToken = hashed;
      user.verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
      await user.save();
      try {
        await sendVerificationEmail(user.email, user.name, raw);
      } catch (emailErr) {
        console.error("Failed to resend verification email:", emailErr);
      }
    }

    return generic;
  } catch (error) {
    console.error("Resend verification error:", error);
    return generic;
  }
}
