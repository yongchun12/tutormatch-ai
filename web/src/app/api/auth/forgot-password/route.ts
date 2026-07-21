import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { generateToken, RESET_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";

/**
 * Starts the forgot-password flow. Always returns the same generic response so
 * it never reveals whether an email is registered.
 */
export async function POST(req: Request) {
  const generic = NextResponse.json({
    message: "If an account exists for that email, we've sent a password reset link.",
  });

  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findOne({ email });

    if (user) {
      const { raw, hashed } = generateToken();
      user.resetPasswordToken = hashed;
      user.resetPasswordTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();
      try {
        await sendPasswordResetEmail(user.email, user.name, raw);
      } catch (emailErr) {
        console.error("Failed to send password reset email:", emailErr);
      }
    }

    return generic;
  } catch (error) {
    console.error("Forgot password error:", error);
    return generic;
  }
}
