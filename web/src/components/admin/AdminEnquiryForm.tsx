"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateEnquiryAction } from "@/app/dashboard/admin/enquiries/actions";

interface AdminEnquiryFormProps {
  initialData: any;
}

export default function AdminEnquiryForm({ initialData }: AdminEnquiryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    try {
      formData.append("id", initialData._id);
      await adminUpdateEnquiryAction(formData);
      router.push("/dashboard/admin/enquiries");
    } catch (err: any) {
      setError(err.message || "Failed to update enquiry");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Status</label>
        <select 
          name="status" 
          defaultValue={initialData?.status} 
          className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800"
        >
            <option value="pending">Pending</option>
            <option value="responded">Responded</option>
            <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Student Message</label>
        <textarea 
            name="message" 
            defaultValue={initialData?.message} 
            rows={4} 
            required
            className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Centre Reply</label>
        <textarea 
            name="reply" 
            defaultValue={initialData?.reply} 
            rows={4} 
            className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
        />
      </div>

      <div className="flex gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/enquiries")}>
          Cancel
        </Button>
        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
