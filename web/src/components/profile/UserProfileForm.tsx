"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateUserProfileAction } from "@/app/actions/profile-actions";
import { useSession } from "next-auth/react";

interface UserProfileFormProps {
  initialData: any;
}

export default function UserProfileForm({ initialData }: UserProfileFormProps) {
  const { update } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    try {
      await updateUserProfileAction(formData);
      await update({ name: formData.get("name"), email: formData.get("email") });
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
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
                defaultValue={initialData?.name} 
                required
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>

            <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <input 
                type="email" 
                name="email" 
                defaultValue={initialData?.email} 
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
                className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
            />
            </div>

            <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <input 
                type="password" 
                name="newPassword" 
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
