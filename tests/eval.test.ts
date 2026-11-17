import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkLesson } from "../scripts/eval-lessons";

const fixture = JSON.parse(readFileSync("scripts/eval-fixtures/sample-lesson.json", "utf8"));
const failed = (r: { ok: boolean; name: string }[]) => r.filter((x) => !x.ok).map((x) => x.name);

describe("lesson quality check", () => {
  it("passes the reference fixture", () => {
    expect(failed(checkLesson(fixture, fixture._expect))).toEqual([]);
  });
  it("catches a reference solution that fails its own tests", () => {
    const broken = structuredClone(fixture);
    broken.test.code.reference_js = "function topK(nums, k) { return []; }";
    expect(failed(checkLesson(broken, broken._expect))).toContain("code: reference passes every test");
  });
  it("catches an infinite loop in the reference solution", () => {
    const loop = structuredClone(fixture);
    loop.test.code.reference_js = "function topK() { while (true) {} }";
    expect(failed(checkLesson(loop, loop._expect)).some((n) => n.startsWith("code:"))).toBe(true);
  });
  it("catches a lesson that is not in Hebrew and a test that does not fit the topic kind", () => {
    const off = { ...structuredClone(fixture), intro: "In this lesson" };
    off.test.type = "quiz";
    const names = failed(checkLesson(off, off._expect));
    expect(names).toContain("intro is in Hebrew");
    expect(names).toContain("test type fits the topic kind");
  });
});
