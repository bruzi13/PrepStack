// Validates content/skill-maps/*.json: known units and exercise types, existing prerequisites, no cycles.
// Usage: node scripts/check-skill-maps.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIRECTORY = "content/skill-maps";
const EXERCISE_TYPES = new Set(["mcq", "predict", "bug", "complete", "order", "choose", "code", "query", "design", "explain", "story"]);
const LEVELS = new Set(["junior", "mid", "senior", "staff"]);
const KINDS = new Set(["concept", "coding", "design", "practical", "behavioral"]);

let problems = 0;
const report = (track, message) => { problems++; console.error(`✗ ${track}: ${message}`); };

for (const file of readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"))) {
  const map = JSON.parse(readFileSync(join(DIRECTORY, file), "utf8"));
  const units = new Set(map.units.map((unit) => unit.id));
  const skills = new Map(map.skills.map((skill) => [skill.id, skill]));
  if (skills.size !== map.skills.length) report(map.track, "duplicate skill ids");

  for (const skill of map.skills) {
    if (!units.has(skill.unit)) report(map.track, `${skill.id}: unknown unit "${skill.unit}"`);
    if (!LEVELS.has(skill.level)) report(map.track, `${skill.id}: unknown level "${skill.level}"`);
    if (!KINDS.has(skill.kind)) report(map.track, `${skill.id}: unknown kind "${skill.kind}"`);
    if (![1, 2, 3].includes(skill.weight)) report(map.track, `${skill.id}: weight must be 1-3`);
    for (const type of skill.exercises) if (!EXERCISE_TYPES.has(type)) report(map.track, `${skill.id}: unknown exercise "${type}"`);
    for (const prereq of skill.prereqs) if (!skills.has(prereq)) report(map.track, `${skill.id}: missing prerequisite "${prereq}"`);
  }

  // Depth-first search for cycles in the prerequisite graph.
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") { report(map.track, `cycle: ${[...path, id].join(" → ")}`); return; }
    state.set(id, "visiting");
    for (const prereq of skills.get(id)?.prereqs ?? []) visit(prereq, [...path, id]);
    state.set(id, "done");
  };
  for (const id of skills.keys()) visit(id, []);

  const perUnit = map.units.map((unit) => `${unit.id}:${map.skills.filter((skill) => skill.unit === unit.id).length}`).join(" ");
  console.log(`✓ ${map.track}: ${map.skills.length} skills in ${map.units.length} units (${perUnit})`);
}
process.exit(problems ? 1 : 0);
