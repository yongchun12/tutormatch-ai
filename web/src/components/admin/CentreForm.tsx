"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCentreAction, updateCentreAction } from "@/app/dashboard/admin/actions";

interface CentreFormProps {
  initialData?: any;
}

export default function CentreForm({ initialData }: CentreFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    try {
      if (initialData?._id) {
        formData.append("id", initialData._id);
        await updateCentreAction(formData);
      } else {
        await createCentreAction(formData);
      }
      router.push("/dashboard/admin/centres");
    } catch (err: any) {
      setError(err.message || "Failed to save centre");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}

      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Input name="address" defaultValue={initialData?.address} required placeholder="e.g. 12 Jalan SS15/4, Subang Jaya" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Centre Name</label>
          <Input name="name" defaultValue={initialData?.name} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Owner ID (Optional)</label>
          <Input name="ownerId" defaultValue={initialData?.ownerId} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">City</label>
          <Input name="city" defaultValue={initialData?.city} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">State</label>
          <Input name="state" defaultValue={initialData?.state} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Price Range</label>
          <Input name="priceRange" defaultValue={initialData?.priceRange} placeholder="e.g. RM 50 - 100 / month" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Subjects (Comma separated)</label>
          <Input name="subjects" defaultValue={initialData?.subjects?.join(", ")} />
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea 
            name="description" 
            defaultValue={initialData?.description} 
            rows={4} 
            className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
        />
      </div>

      <div className="flex gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/centres")}>
          Cancel
        </Button>
        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
          {loading ? "Saving..." : "Save Centre"}
        </Button>
      </div>
    </form>
  );
}
