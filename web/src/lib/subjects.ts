/**
 * One name per subject.
 *
 * Subjects reach the database from four writers that never agreed on spelling:
 * the Google Maps crawler's keyword list, the Gemini website sync (free text,
 * copied from whatever the centre's own site calls it), the admin form and the
 * owner form (both a comma-separated box). The directory's Subjects filter is
 * built by counting distinct strings, so every spelling became its own
 * checkbox — the live database held "Additional Mathematics", "Additional
 * Maths", "Add Math", "Addmath", "Mathematics - Additional" and "Matematik
 * Tambahan" as six separate filters, each matching a different handful of
 * centres and none matching all of them.
 *
 * This module is the single vocabulary all of those writers pass through.
 * Matching is on a punctuation- and case-insensitive key, so a spelling that
 * differs only in "&"/"and", hyphens, brackets or capitals needs no alias entry.
 *
 * Deliberately NOT a whitelist: a subject nobody listed here is kept as typed
 * (tidied for whitespace and casing) rather than dropped. Centres teach
 * Ukulele, Zumba and Iqra, and losing them would be worse than an unmerged
 * duplicate.
 */

/**
 * The comparison key: lowercase, no accents, no punctuation, single spaces.
 *
 * "Mathematics - Additional", "Mathematics (Additional)" and "mathematics
 * additional" all collapse to `mathematics additional`, which is why the alias
 * lists below only need one form of each distinct wording.
 */
function subjectKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Canonical name -> every other spelling seen in the data or likely to be typed.
 *
 * The canonical side is the name the exam boards use, in English, with two
 * exceptions: Bahasa Melayu keeps its Malay name because that is the subject's
 * official title, and language subjects are named for the language taught
 * ("Chinese", not "Mandarin"/"Bahasa Cina") so one language is one filter.
 *
 * `crawler/crawler/spiders/tuition_spider.py` and `SUBJECT_KEYWORDS` in
 * `services/scraperService.ts` still emit their own labels — they no longer
 * have to match each other, because everything written to the database is run
 * through `canonicalSubjects()` first. That is why "Sejarah" appears below as
 * an alias of History even though nobody types it into a form.
 */
const SUBJECT_ALIASES: Record<string, string[]> = {
  // --- Mathematics -------------------------------------------------------
  Mathematics: [
    "math", "maths", "mathematic", "mathematics kssm", "modern mathematics",
    "mathematics modern", "matematik", "matematik moden", "matematik modern",
  ],
  "Additional Mathematics": [
    "additional math", "additional maths", "add math", "add maths", "addmath",
    "addmaths", "a math", "a maths", "mathematics additional",
    "matematik tambahan", "add matematik",
  ],
  /*
    "Advanced Mathematics" is folded in here rather than kept apart. In this
    dataset it is one centre's label for the A-Level/STPM extension paper that
    everyone else calls Further Mathematics, and it arrived split as
    "Advanced Mathematics (I)" and "(II)" — three filters for one course.
  */
  "Further Mathematics": [
    "further math", "further maths", "advanced mathematics", "advanced math",
    "advanced maths", "advanced mathematics i", "advanced mathematics ii",
  ],

  // --- Languages ---------------------------------------------------------
  /*
    Every English-language variant collapses to one entry, including the
    first/second-language and writing splits. They describe who the class is
    for, not a different subject, and as separate checkboxes they hid centres
    from anyone filtering on plain "English". Literature stays separate below.
  */
  English: [
    "english language", "bahasa inggeris", "bahasa inggris", "inggeris",
    "english 1st language", "english first language",
    "english as a first language", "english 2nd language",
    "english second language", "english as a second language", "esl", "efl",
    "english writing", "english composition",
  ],
  "English Literature": [
    "literature in english", "kesusasteraan inggeris", "eng literature",
  ],
  "Bahasa Melayu": [
    "bahasa malaysia", "bahasa melayu penulisan", "malay", "malay language",
    "bm", "malay first language", "malay foreign language", "malay as a foreign language",
    "bm karangan", "karangan", "penulisan bm",
  ],
  // "BC" is the abbreviation for Bahasa Cina; it is only ever a subject name
  // in this field, so the collision risk that killed bare "bm"-style substring
  // matching in the crawler does not apply to a whole-value lookup.
  Chinese: [
    "mandarin", "mandarin chinese", "bahasa cina", "bahasa mandarin", "bc",
    "chinese language", "chinese writing", "cina",
  ],
  Tamil: ["bahasa tamil", "tamil language"],

  // --- Sciences ----------------------------------------------------------
  Science: ["sains", "general science", "sains am"],
  // A distinct IGCSE subject, not a synonym of Science — kept apart, with its
  // own spellings merged.
  // Both spacings of "co-ordinated" are listed: subjectKey() turns the hyphen
  // into a space, so "Co-ordinated" and "Coordinated" do NOT share a key.
  "Combined Science": [
    "science combined", "integrated science",
    "coordinated sciences", "sciences coordinated",
    "co ordinated sciences", "sciences co ordinated",
    "coordinated science", "science coordinated",
  ],
  Physics: ["fizik"],
  Chemistry: ["kimia"],
  Biology: ["biologi"],

  // --- Humanities and commerce -------------------------------------------
  History: ["sejarah"],
  Geography: ["geografi"],
  Economics: ["economy", "ekonomi", "ekonomi asas"],
  Accounting: [
    "account", "accounts", "akaun", "akaun perniagaan", "perakaunan",
    "prinsip perakaunan", "p perakaunan", "principles of accounting",
    "principles of accounts",
  ],
  "Business Studies": ["business", "perniagaan", "pengajian perniagaan"],
  "Moral Education": ["moral", "moral studies", "pendidikan moral"],
  "Islamic Studies": ["pendidikan islam", "agama islam", "islamic education"],

  // --- Computing ---------------------------------------------------------
  ICT: [
    "information and communication technology",
    "information communication technology", "info comm technology",
  ],
  "Computer Science": ["computing", "coding", "programming", "sains komputer"],
};

/** key -> canonical name, built once at module load. */
const CANONICAL_BY_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(SUBJECT_ALIASES).flatMap(([canonical, aliases]) =>
    [canonical, ...aliases].map((form) => [subjectKey(form), canonical] as const),
  ),
);

/**
 * Tidy an unrecognised subject without changing what it says.
 *
 * Only fully-lowercase words are capitalised, so acronyms and mixed-case names
 * survive: "ict" is left for the alias table, "ICT", "IELTS" and "K-pop Dance"
 * come back unchanged, and "ballet" becomes "Ballet" so it stops being a second
 * checkbox beside "Ballet".
 */
function tidyUnknown(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (/[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * The one name this subject should be stored and displayed under, or null if
 * the input is empty/not a usable string.
 */
export function canonicalSubject(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return CANONICAL_BY_KEY.get(subjectKey(trimmed)) ?? tidyUnknown(trimmed);
}

/**
 * Canonicalise a whole list, dropping blanks and duplicates.
 *
 * First-seen order is kept, so a centre's own ordering survives; only the
 * later copies of a name it now shares with an earlier entry are removed.
 */
export function canonicalSubjects(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const canonical = canonicalSubject(item);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

/**
 * Parse the comma-separated Subjects box on the admin and owner forms into a
 * canonical list. "Add Maths, addmath , Mathematics" -> ["Additional
 * Mathematics", "Mathematics"].
 */
export function parseSubjectsInput(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return canonicalSubjects(value.split(","));
}

/**
 * True when two subject names mean the same subject — "Add Maths" and
 * "Matematik Tambahan" do. Used where a student's freely-typed subject has to
 * be matched against a centre's list.
 */
export function isSameSubject(a: unknown, b: unknown): boolean {
  const left = canonicalSubject(a);
  const right = canonicalSubject(b);
  return left !== null && left === right;
}
