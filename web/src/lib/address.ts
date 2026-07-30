/**
 * Parsing for Malaysian addresses as Google Places formats them.
 *
 * Pure: string handling only, no I/O.
 *
 * Google returns addresses in a predictable shape:
 *
 *   46-1, Jln Prima 2, Metro Prima, 52100 Kuala Lumpur, Wilayah Persekutuan …, Malaysia
 *   └───────── street ──────────┘  └postcode┘ └ city ┘  └────── state ─────┘  └country┘
 *
 * Three different bits of code used to pull city and state out of this, and all
 * three were wrong in different ways:
 *
 *   - scraperService.ts did `const city = state`, so every centre's city was its
 *     state ("Penang, Penang").
 *   - cron/route.ts stored the searched area as the city and the literal string
 *     "Malaysia" as the state — so a Selangor centre had city "Selangor",
 *     state "Malaysia".
 *   - crawl/ondemand took the LAST comma-separated part as the state, which is
 *     the country ("Malaysia"), and the second-to-last as the city, which is
 *     actually the state.
 *
 * This is the single correct implementation they now all share.
 */

/** The 13 states plus 3 federal territories, with the variants Google uses. */
const STATE_PATTERNS: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: "Johor", patterns: ["johor darul ta'zim", "johor darul takzim", "johor"] },
  { canonical: "Kedah", patterns: ["kedah darul aman", "kedah"] },
  { canonical: "Kelantan", patterns: ["kelantan darul naim", "kelantan"] },
  { canonical: "Melaka", patterns: ["melaka", "malacca"] },
  { canonical: "Negeri Sembilan", patterns: ["negeri sembilan darul khusus", "negeri sembilan"] },
  { canonical: "Pahang", patterns: ["pahang darul makmur", "pahang"] },
  { canonical: "Perak", patterns: ["perak darul ridzuan", "perak"] },
  { canonical: "Perlis", patterns: ["perlis indera kayangan", "perlis"] },
  { canonical: "Penang", patterns: ["pulau pinang", "penang"] },
  { canonical: "Sabah", patterns: ["sabah"] },
  { canonical: "Sarawak", patterns: ["sarawak"] },
  { canonical: "Selangor", patterns: ["selangor darul ehsan", "selangor"] },
  { canonical: "Terengganu", patterns: ["terengganu darul iman", "terengganu"] },
  // Federal territories. "Wilayah Persekutuan" is the Malay for federal
  // territory and Google prefixes it, so match the longer form first.
  { canonical: "Kuala Lumpur", patterns: ["wilayah persekutuan kuala lumpur", "kuala lumpur"] },
  { canonical: "Putrajaya", patterns: ["wilayah persekutuan putrajaya", "putrajaya"] },
  { canonical: "Labuan", patterns: ["wilayah persekutuan labuan", "labuan"] },
];

export interface ParsedAddress {
  /** Town or city, e.g. "Skudai". Empty when it cannot be determined. */
  city: string;
  /** Canonical state name, e.g. "Johor". Empty when unknown. */
  state: string;
  /** Five-digit Malaysian postcode, or empty. */
  postcode: string;
}

/** Match a fragment to a canonical state name, or return "". */
export function canonicalState(fragment: string | null | undefined): string {
  if (!fragment) return "";
  const lower = fragment.toLowerCase().trim();
  for (const { canonical, patterns } of STATE_PATTERNS) {
    if (patterns.some((p) => lower.includes(p))) return canonical;
  }
  return "";
}

/** Malaysian postcodes are exactly five digits. */
export function extractPostcode(address: string | null | undefined): string {
  if (!address) return "";
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : "";
}

/**
 * Pull city, state and postcode out of a Google-formatted Malaysian address.
 *
 * Never invents a value: a part it cannot determine comes back as "", which the
 * caller stores as empty rather than as a guess.
 */
export function parseMalaysianAddress(
  address: string | null | undefined
): ParsedAddress {
  if (!address || typeof address !== "string") {
    return { city: "", state: "", postcode: "" };
  }

  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Drop the trailing country. Taking the last part as the state is exactly the
  // bug that stored "Malaysia" as a state name.
  while (parts.length > 0 && /^malaysia$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }

  const postcode = extractPostcode(address);

  // The state is the last fragment that names one — searching from the end,
  // because a street can share a state's name ("Jalan Melaka" in KL).
  let state = "";
  let stateIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = canonicalState(parts[i]);
    if (candidate) {
      state = candidate;
      stateIndex = i;
      break;
    }
  }

  // The city normally sits in the "<postcode> <City>" fragment.
  let city = "";
  const postcodePart = parts.find((p) => postcode && p.includes(postcode));
  if (postcodePart) {
    city = postcodePart.replace(postcode, "").trim();
  }

  // No postcode fragment: fall back to the part just before the state.
  if (!city && stateIndex > 0) {
    city = parts[stateIndex - 1];
  }

  // Strip any leftover digits and tidy up.
  city = city.replace(/\d+/g, "").replace(/\s+/g, " ").trim();

  // A "city" that is really the state again (Google does this for the federal
  // territories, "…, 50450 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur")
  // is still correct — KL is both. But drop it when it is a bare duplicate of a
  // different state name, which means the parse went wrong.
  if (city && canonicalState(city) && canonicalState(city) !== state) {
    city = "";
  }

  return { city, state, postcode };
}

/**
 * Reduce a full address or landmark to the AREA worth searching.
 *
 * Google's autocomplete hands back the whole postal address of whatever the
 * visitor picked:
 *
 *   "Mid Valley Southkey Shopping Mall, Persiaran Southkey 1, Southkey,
 *    Johor Bahru, Johor, Malaysia"
 *
 * Passing that straight to the Places text search asks Google to find THAT
 * BUILDING, and it obliges: `tuition centre in <the whole string>` returns one
 * result, "The Mall, Mid Valley Southkey" — the mall itself, which is then
 * discarded for not looking like a tuition centre. So a visitor searching a real
 * shopping mall in Johor Bahru saw "No new centres found online" while Google
 * Maps plainly listed centres nearby. `tuition centre in Johor Bahru` returns
 * twenty.
 *
 * The same string was also being cut down for the database lookup by taking the
 * first word of four or more letters — which is "Valley", matched against city
 * and state, and matches nothing in Johor.
 *
 * Both callers now come here instead. Returns "City, State" when the city is
 * known, the state alone when it is not, and the original text when the address
 * parses to nothing at all (a bare "Kepong" is a better query than an empty one).
 */
export function toSearchArea(location: string | null | undefined): string {
  const raw = (location ?? "").trim();
  if (!raw) return "";

  const { city, state } = parseMalaysianAddress(raw);

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;

  // Unparseable: fall back to the last comma-separated part that is not the
  // country, which is the closest thing to a locality the string offers.
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p.toLowerCase() !== "malaysia");

  return parts.length > 0 ? parts[parts.length - 1] : raw;
}
