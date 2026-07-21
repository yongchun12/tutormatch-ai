import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { hashToken } from "@/lib/tokens";

/**
 * Activation link target. Verifies the one-time token, marks the account as
 * verified, then redirects to the login page with a status flag.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const redirectTo = (status: string) =>
    NextResponse.redirect(new URL(`/auth/login?verify=${status}`, req.url));

  if (!token) {
    return redirectTo("invalid");
  }

  try {
    await dbConnect();

    const user = await User.findOne({
      verificationToken: hashToken(token),
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return redirectTo("invalid");
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    return redirectTo("success");
  } catch (error) {
    console.error("Email verification error:", error);
    return redirectTo("error");
  }
}
