"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

/**
 * A Malaysian place picker: type an area, choose from Google's suggestions.
 *
 * The same debounced-fetch / click-outside / geocode-on-select block was written
 * inline three times (CentresListClient, HomeSearchClient, PreferencesForm), and
 * the recommendations page — the one page whose ranking actually weights
 * distance — had no picker at all, just a free-text box. This is that block,
 * once, so the fourth page did not become a fourth copy.
 *
 * The text is owned by the PARENT via `value`/`onChange`. That matters because
 * every caller does something different when it changes: one clears a GPS fix,
 * another resets a crawl guard. This component only knows how to suggest.
 */

export interface LocationPick {
  /** The full place name, e.g. "Subang Jaya, Selangor, Malaysia". */
  description: string;
  /** Coordinates, when Google could resolve them. Absent if the lookup failed. */
  lat?: number;
  lng?: number;
}

interface LocationAutocompleteProps {
  value: string;
  /** Fired on every keystroke. The parent decides what typing invalidates. */
  onChange: (value: string) => void;
  /** Fired when a suggestion is chosen, after its coordinates are looked up. */
  onPick: (pick: LocationPick) => void;
  placeholder?: string;
  /** Applied to the input, so each page keeps its own field sizing. */
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

/** Google returns nothing useful for one or two characters, so don't ask. */
const MIN_QUERY_LENGTH = 3;

/** Wait for a pause in typing before spending an autocomplete call. */
const DEBOUNCE_MS = 300;

export default function LocationAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "Town or area…",
  className = "",
  "aria-label": ariaLabel = "Search for a location",
  disabled = false,
}: LocationAutocompleteProps) {
  const [predictions, setPredictions] = useState<
    { place_id: string; description: string; main_text?: string; secondary_text?: string }[]
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
    Debounced lookup. The cleanup cancels both the pending timer and any request
    already in flight, so a fast typist spends one API call rather than one per
    character — and a slow reply to "sub" can no longer land after the reply to
    "subang jaya" and repopulate the list with the older query's suggestions.

    Everything that sets state happens inside the timer or the response handler,
    never in the effect body: a synchronous setState here would re-render on
    every keystroke before the fetch had done anything.
  */
  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const query = value.trim();

    const timer = setTimeout(async () => {
      if (query.length < MIN_QUERY_LENGTH) {
        setPredictions([]);
        return;
      }
      try {
        setLoading(true);
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setPredictions(data.predictions || []);
      } catch (error) {
        // An aborted request is this effect being superseded, not a failure.
        if ((error as Error)?.name === "AbortError") return;
        // A failed suggestion lookup is not worth an error message: the typed
        // text still works, because every caller falls back to matching on it.
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  // Close when the click lands anywhere else on the page.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const select = async (prediction: { place_id: string; description: string }) => {
    setOpen(false);
    setPredictions([]);

    /*
      Resolve the place to coordinates before handing it back.

      Text alone is not enough for the callers that rank by distance: "Subang
      Jaya" as a string can only be matched against a centre's city field, while
      coordinates work for landmarks and for centres whose address is written
      differently. A failed lookup still reports the name, so the caller can fall
      back to text matching.
    */
    try {
      const res = await fetch(`/api/location/geocode?place_id=${prediction.place_id}`);
      const data = await res.json();
      onPick({
        description: prediction.description,
        lat: typeof data.lat === "number" ? data.lat : undefined,
        lng: typeof data.lng === "number" ? data.lng : undefined,
      });
    } catch {
      onPick({ description: prediction.description });
    }
  };

  return (
    <div className="relative w-full" ref={boxRef}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open && predictions.length > 0}
        autoComplete="off"
        disabled={disabled}
        className={className}
      />

      {loading && (
        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
      )}

      {/* The length check is part of the condition, not just of the fetch, so
          suggestions for a longer query cannot linger after the box is cleared
          back down to a character or two. */}
      {open && value.trim().length >= MIN_QUERY_LENGTH && predictions.length > 0 && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-40 max-h-64 overflow-y-auto"
        >
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => select(p)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex items-start gap-3 transition-colors"
            >
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {p.main_text || p.description}
                </span>
                {p.secondary_text && (
                  <span className="text-xs text-slate-500 truncate">{p.secondary_text}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
