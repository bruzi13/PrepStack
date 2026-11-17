// How a lesson is looked up in the shared cache. Pure functions, shared by the server and the tests.

/** Bump when the lesson or test prompt or schema changes: old templates keep serving until new ones exist. */
export const PROMPT_VERSION = 1;

export type LevelBand = "junior" | "mid" | "senior";

/** Onboarding levels map onto three bands (decision of 17 Nov 2026). */
export function levelBand(level: string | undefined | null): LevelBand {
  if (level === "senior" || level === "staff") return "senior";
  if (level === "mid") return "mid";
  return "junior"; // student, junior, unknown
}

/** A stable key for a topic title: lower case, punctuation and extra spaces removed, Hebrew kept. */
export function topicKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")          // Hebrew vowel marks
    .replace(/[^\p{L}\p{N}]+/gu, "-")         // anything that is not a letter or digit becomes a dash
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Deterministic rollout bucket 0-99 for a user id, so a learner stays on the same side of the flag. */
export function rolloutBucket(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100;
}
export const inRollout = (userId: string, percent: number) => rolloutBucket(userId) < Math.max(0, Math.min(100, percent));

/** Test bank size per template (decision of 17 Nov 2026). */
export const TESTS_INITIAL = 4;
export const TESTS_MAX = 6;

/** Which bank test a learner gets: one they have not seen; else, while the bank is below the cap, a new one;
 *  else the one they saw longest ago. `seen` is test ids in the order the learner saw them (oldest first). */
export function pickTest(bank: string[], seen: string[]): { id: string } | { generate: true } {
  const unseen = bank.filter((id) => !seen.includes(id));
  if (unseen.length) return { id: unseen[0] };
  if (bank.length < TESTS_MAX) return { generate: true };
  const oldest = seen.find((id) => bank.includes(id));
  return { id: oldest ?? bank[0] };
}
