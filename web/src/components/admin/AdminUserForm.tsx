"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminCreateUserAction, adminUpdateUserAction } from "@/app/dashboard/admin/actions";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password";

interface AdminUserFormProps {
  initialData?: any;
}

export default function AdminUserForm({ initialData }: AdminUserFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    // Fast feedback only — the server action enforces the same rule, since a
    // client-side check is trivially bypassed.
    const password = (formData.get("password") as string) || "";
    if (!initialData || password.trim() !== "") {
      const problem = validatePassword(password);
      if (problem) {
        setError(problem);
        setLoading(false);
        return;
      }
    }

    try {
      if (initialData) {
        formData.append("id", initialData._id);
        await adminUpdateUserAction(formData);
      } else {
        await adminCreateUserAction(formData);
      }
      router.push("/dashboard/admin/users");
    } catch (err: any) {
      setError(err.message || "Failed to save user");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <input 
            type="text" 
            name="name" 
            defaultValue={initialData?.name} 
            required
            className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input 
            type="email" 
            name="email" 
            defaultValue={initialData?.email} 
            required
            className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
          />
        </div>

        {/*
          On create the password is required; on edit it is optional and blank
          means "leave it alone". There was previously no way to change a
          password from the admin area at all, so an admin helping a locked-out
          user had nothing to offer them.

          Note the field is write-only by necessity: only the bcrypt hash is
          stored, so an existing password can be replaced but never shown.
        */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="admin-user-password">
            {initialData ? "New password" : "Password"}
          </label>
          <input
            id="admin-user-password"
            type="password"
            name="password"
            required={!initialData}
            autoComplete="new-password"
            minLength={initialData ? undefined : MIN_PASSWORD_LENGTH}
            placeholder={initialData ? "Leave blank to keep the current one" : ""}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
          />
          <p className="text-xs text-slate-500">
            {initialData
              ? `Only set this to reset the password. Minimum ${MIN_PASSWORD_LENGTH} characters.`
              : `Minimum ${MIN_PASSWORD_LENGTH} characters.`}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Role</label>
          <select 
            name="role" 
            defaultValue={initialData?.role || "student"} 
            required
            className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
          >
              <option value="student">Student</option>
              <option value="owner">Centre Owner</option>
              <option value="admin">Administrator</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/users")}>
          Cancel
        </Button>
        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
          {loading ? "Saving..." : "Save User"}
        </Button>
      </div>
    </form>
  );
}
