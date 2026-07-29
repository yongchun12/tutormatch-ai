"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateUserProfileAction } from "@/app/actions/profile-actions";
import { useSession } from "next-auth/react";

interface UserProfileFormProps {
  initialData: any;
}

export default function UserProfileForm({ initialData }: UserProfileFormProps) {
  const { update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // Controlled so the fields keep showing what was just saved. They used to be
  // uncontrolled with a defaultValue, and the form called reset() on success —
  // which restored the ORIGINAL name, making a successful save look like it had
  // been discarded.
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    try {
      await updateUserProfileAction(formData);
      // Re-mints the JWT from the database, so the navbar and every
      // server-rendered sidebar pick up the new name without a re-login.
      await update();
      // Server Components on this page still hold the old name in their
      // rendered output until they re-run.
      router.refresh();
      setSuccess(true);
      // Only the password fields are cleared — the identity fields keep the
      // values that were just saved.
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}
      {success && <div className="text-emerald-500 bg-emerald-50 p-3 rounded">Profile updated successfully!</div>}
      
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
            <label className="text-sm font-medium">Full Name</label>
            <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>

            <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <h3 className="text-lg font-medium">Change Password</h3>
        <p className="text-sm text-slate-500">Leave blank if you do not want to change your password.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
            <label className="text-sm font-medium">Current Password</label>
            <input
                type="password"
                name="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>

            <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <input
                type="password"
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white w-full md:w-auto" disabled={loading}>
          {loading ? "Saving Changes..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
