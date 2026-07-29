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

  // Controlled for the same reason as the owner form: Base UI's FieldControl
  // warns if an uncontrolled field's defaultValue ever changes. `?? ""` keeps a
  // field that is absent on the record (ownerId on a new centre) from starting
  // life as `undefined`, which React reads as "uncontrolled".
  const [fields, setFields] = useState({
    address: initialData?.address ?? "",
    name: initialData?.name ?? "",
    ownerId: initialData?.ownerId ?? "",
    city: initialData?.city ?? "",
    state: initialData?.state ?? "",
    priceRange: initialData?.priceRange ?? "",
    subjects: initialData?.subjects?.join(", ") ?? "",
    description: initialData?.description ?? "",
  });

  const setField = (key: keyof typeof fields) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setFields((prev) => ({ ...prev, [key]: e.target.value }));

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
        <Input name="address" value={fields.address} onChange={setField("address")} required placeholder="e.g. 12 Jalan SS15/4, Subang Jaya" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Centre Name</label>
          <Input name="name" value={fields.name} onChange={setField("name")} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Owner ID (Optional)</label>
          <Input name="ownerId" value={fields.ownerId} onChange={setField("ownerId")} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">City</label>
          <Input name="city" value={fields.city} onChange={setField("city")} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">State</label>
          <Input name="state" value={fields.state} onChange={setField("state")} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Price Range</label>
          <Input name="priceRange" value={fields.priceRange} onChange={setField("priceRange")} placeholder="e.g. RM 50 - 100 / month" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Subjects (Comma separated)</label>
          <Input name="subjects" value={fields.subjects} onChange={setField("subjects")} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
            name="description"
            value={fields.description}
            onChange={setField("description")}
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
