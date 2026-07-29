"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2 } from "lucide-react";
import { updateCentreAction } from "@/app/dashboard/owner/centre/actions";
import FileUploader from "@/components/FileUploader";

interface CentreFormProps {
  initialData: any;
}

export default function CentreForm({ initialData }: CentreFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [galleryUrls, setGalleryUrls] = useState<string[]>(initialData.galleryUrls || []);

  /**
   * Every text field is controlled.
   *
   * They were uncontrolled with `defaultValue={initialData.<field>}`. Base UI's
   * FieldControl captures the default on first render, and warns when a later
   * render supplies a different one ("A component is changing the default value
   * state of an uncontrolled FieldControl after being initialized").
   *
   * That is exactly what happened here: a successful save calls router.refresh(),
   * the Server Component re-runs, and a brand-new `initialData` arrives with the
   * saved values — so every field the owner had just edited changed its default.
   * Fields absent on the record (contactNumber, priceRange, subjects) also went
   * from `undefined` to a string, which is the same transition.
   *
   * `?? ""` matters: a controlled input given `undefined` is treated as
   * uncontrolled, which would reintroduce the warning from the other direction.
   */
  const [fields, setFields] = useState({
    name: initialData.name ?? "",
    contactNumber: initialData.contactNumber ?? "",
    description: initialData.description ?? "",
    city: initialData.city ?? "",
    state: initialData.state ?? "",
    location: initialData.address ?? "",
    priceRange: initialData.priceRange ?? "",
    teachingMode: initialData.teachingMode ?? "",
    subjects: initialData.subjects?.join(", ") ?? "",
  });

  const setField = (key: keyof typeof fields) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setFields((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    const formData = new FormData(e.currentTarget);
    const res = await updateCentreAction(initialData._id.toString(), formData);

    if (res.error) {
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({
        type: "success",
        text: res.published
          ? "Centre details saved — your listing is now live in the directory."
          : "Centre details updated successfully!",
      });
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message.text && (
        <div className={`p-4 rounded-xl text-sm font-medium ${
          message.type === "success" 
            ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800" 
            : "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/30 dark:border-rose-800"
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Centre Name</label>
          <Input
            name="name"
            value={fields.name}
            onChange={setField("name")}
            required
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contact Number</label>
          <Input
            name="contactNumber"
            value={fields.contactNumber}
            onChange={setField("contactNumber")}
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
          <Textarea
            name="description"
            value={fields.description}
            onChange={setField("description")}
            rows={4}
            required
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">City</label>
          <Input
            name="city"
            value={fields.city}
            onChange={setField("city")}
            required
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">State</label>
          <Input
            name="state"
            value={fields.state}
            onChange={setField("state")}
            required
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Address</label>
          <Textarea
            name="location"
            value={fields.location}
            onChange={setField("location")}
            rows={2}
            required
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Monthly Fee / Price Range</label>
          <Input
            name="priceRange"
            value={fields.priceRange}
            onChange={setField("priceRange")}
            placeholder="e.g. RM 150 - RM 300 / month"
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Teaching Mode</label>
          {/* Was defaulted to "physical", so an owner saving an unrelated change
              silently committed a mode they had never chosen. */}
          <select
            name="teachingMode"
            value={fields.teachingMode}
            onChange={setField("teachingMode")}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus-visible:ring-slate-300"
          >
            <option value="">Not specified</option>
            <option value="physical">Physical (In-person)</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subjects Offered (Comma separated)</label>
          <Input
            name="subjects"
            value={fields.subjects}
            onChange={setField("subjects")}
            placeholder="e.g. Mathematics, Science, English"
            className="dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Media Gallery</label>
          <p className="text-xs text-slate-500 mb-2">Upload up to 10 photos of your centre to attract more students.</p>
          <FileUploader 
            value={galleryUrls} 
            onChange={setGalleryUrls} 
            maxFiles={10} 
          />
          {/* Hidden input to submit the array of URLs with formData */}
          <input type="hidden" name="galleryUrls" value={JSON.stringify(galleryUrls)} />
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
        <Button 
          type="submit" 
          disabled={loading}
          className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
