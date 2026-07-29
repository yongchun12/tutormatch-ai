import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        await dbConnect();

        const user = await User.findOne({ email: credentials.email }).lean();
        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        // Block sign-in until the email is activated. Existing/seeded accounts
        // without the field (undefined) are treated as already verified, so only
        // newly-registered users (emailVerified === false) are gated. The thrown
        // message is surfaced to the client so it can offer to resend the link.
        if (user.emailVerified === false) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
      }

      // The token is minted at sign-in and then reused verbatim, so a profile
      // edit used to leave a stale name in every server-rendered header until
      // the user logged out and back in. `trigger === "update"` fires when a
      // client calls useSession().update(), which is what the profile form
      // does after saving.
      //
      // The new values are re-read from the database rather than taken from
      // the payload the client passed to update() — that payload is
      // caller-controlled, so trusting it would let any signed-in user rewrite
      // their own role claim. Re-reading also picks up changes the user did
      // not make themselves, e.g. an approved ownership claim promoting a
      // student to "owner".
      if (trigger === "update" && token.id) {
        await dbConnect();
        const fresh = await User.findById(token.id).select("name email role").lean();
        if (fresh) {
          token.name = fresh.name;
          token.email = fresh.email;
          token.role = fresh.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        // next-auth seeds session.user.name/email from the token's standard
        // claims, so these are only re-asserted for the refresh path above.
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
};
