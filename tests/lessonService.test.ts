import { describe, expect, it, vi } from "vitest";
import { LessonService } from "../netlify/functions/_services/lessonService";
import type { BankTest, CatalogTopic, Json, LessonGenerator, LessonStore, Template, TemplateKey, TopicRow } from "../netlify/functions/_services/ports";
import { rolloutBucket, TESTS_INITIAL, TESTS_MAX } from "../shared/lessonKeys";

/** An in-memory LessonStore with the same single-flight rule as the database's partial unique index. */
class MemStore implements LessonStore {
  templates: Template[] = [];
  bank = new Map<string, BankTest[]>();
  lessons: Json[] = [];
  percent = 100;
  topics = new Map<string, TopicRow>();
  catalogRows = new Map<string, CatalogTopic>();
  weak: string[] = [];
  private n = 0;
  private id = () => `id-${++this.n}`;
  private same = (t: TemplateKey, k: TemplateKey) => (Object.keys(k) as (keyof TemplateKey)[]).every((f) => t[f] === k[f]);

  async topic(userId: string, topicId: string) { const t = this.topics.get(topicId); return t && t.user_id === userId ? t : null; }
  async learner() { return { display_name: "נועה", answers: { level: "senior" } }; }
  async catalog(key: string) { return this.catalogRows.get(key) ?? null; }
  async lastWeakPoints() { return this.weak; }
  async cachePercent() { return this.percent; }
  async findTemplate(key: TemplateKey, status: Template["status"]) {
    return this.templates.filter((t) => this.same(t, key) && t.status === status).sort((a, b) => b.version - a.version)[0] ?? null;
  }
  async claim(key: TemplateKey, leaseMs: number, version: number) {
    if (this.templates.some((t) => this.same(t, key) && (t.status === "generating" || t.status === "ready"))) return null;
    const t: Template = { ...key, id: this.id(), status: "generating", content: null, lease_until: new Date(Date.now() + leaseMs).toISOString(), version };
    this.templates.push(t); return t;
  }
  async takeOver() { return false; }
  async completeTemplate(id: string, content: Json) { Object.assign(this.templates.find((t) => t.id === id)!, { status: "ready", content }); }
  async failTemplate(id: string) { this.templates.find((t) => t.id === id)!.status = "failed"; }
  async retire(id: string) { this.templates.find((t) => t.id === id)!.status = "retired"; }
  async tests(templateId: string) { return this.bank.get(templateId) ?? []; }
  async addTest(templateId: string, test: Json) { const t = { id: this.id(), test }; this.bank.set(templateId, [...(this.bank.get(templateId) ?? []), t]); return t; }
  async seenTests(userId: string, templateId: string) { return this.lessons.filter((l) => l.user_id === userId && l.template_id === templateId).map((l) => l.test_id as string); }
  async insertLesson(row: Json) { const l = { ...row, id: this.id() }; this.lessons.push(l); return l; }
  async bumpUses() { /* counted in the database */ }
}

function makeGen() {
  return {
    about: (t: { title: string }, o: { band?: string }) => ({ about: `${t.title}|${o.band}`, testType: "quiz", kind: "concept" }),
    body: vi.fn(async (about: string) => ({ title: about, intro: "", blocks: [], takeaways: [], interview_tips: [] })),
    test: vi.fn(async () => ({ type: "quiz", quiz: [] })),
    note: vi.fn(async () => "שימי לב לאינדקסים"),
    personal: vi.fn(async () => ({ title: "personal", test: { type: "quiz" } })),
  } satisfies LessonGenerator;
}

const clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5))) };

function setup(users = ["u1", "u2", "u3"]) {
  const store = new MemStore();
  store.catalogRows.set("caching", { topic_key: "caching", title: "Caching ו-CDN", description: "", kind: "concept" });
  users.forEach((u, i) => store.topics.set(`t${i}`, { id: `t${i}`, user_id: u, title: "Caching", description: "", module: "SD", kind: "concept", topic_key: "caching", mastery: 0, reviews: 0 }));
  const gen = makeGen();
  return { store, gen, svc: new LessonService(store, gen, clock) };
}
const args = (topicId: string) => ({ topicId, format: "worked_examples", manual: false });

describe("LessonService", () => {
  it("generates a shared lesson once, with the initial test bank", async () => {
    const { store, gen, svc } = setup();
    const r = await svc.start("u1", args("t0"));
    expect(r.source).toBe("generated");
    expect(gen.body).toHaveBeenCalledTimes(1);
    expect(gen.test).toHaveBeenCalledTimes(TESTS_INITIAL);
    expect(store.bank.get(store.templates[0].id)).toHaveLength(TESTS_INITIAL);
    expect(r.lesson.template_id).toBe(store.templates[0].id);
  });

  it("serves the next learner from the cache with no model call", async () => {
    const { gen, svc } = setup();
    await svc.start("u1", args("t0"));
    gen.body.mockClear(); gen.test.mockClear();
    const r = await svc.start("u2", args("t1"));
    expect(r.source).toBe("cache");
    expect(gen.body).not.toHaveBeenCalled();
    expect(gen.test).not.toHaveBeenCalled();
  });

  it("generates only once when two learners open a new topic at the same moment", async () => {
    const { store, gen, svc } = setup();
    const [a, b] = await Promise.all([svc.start("u1", args("t0")), svc.start("u2", args("t1"))]);
    expect(gen.body).toHaveBeenCalledTimes(1);
    expect(store.templates.filter((t) => t.status === "ready")).toHaveLength(1);
    expect(new Set([a.source, b.source])).toEqual(new Set(["generated", "cache"]));
  });

  it("gives a returning learner a test they have not seen, grows the bank to the cap, then reuses", async () => {
    const { store, gen, svc } = setup(["u1"]);
    const seen = new Set<string>();
    for (let i = 0; i < TESTS_MAX + 2; i++) seen.add((await svc.start("u1", args("t0"))).lesson.test_id as string);
    expect(store.bank.get(store.templates[0].id)).toHaveLength(TESTS_MAX);
    expect(seen.size).toBe(TESTS_MAX);
    expect(gen.test).toHaveBeenCalledTimes(TESTS_MAX);
  });

  it("serves a stale template at once and regenerates it afterwards", async () => {
    const { store, gen, svc } = setup();
    await svc.start("u1", args("t0"));
    store.templates[0].status = "stale";
    gen.body.mockClear();
    const r = await svc.start("u2", args("t1"));
    expect(r.lesson.template_id).toBe(store.templates[0].id);
    expect(gen.body).not.toHaveBeenCalled();
    await r.after?.();
    expect(gen.body).toHaveBeenCalledTimes(1);
    expect(store.templates[0].status).toBe("retired");
    expect(store.templates.find((t) => t.status === "ready")?.version).toBe(2);
  });

  it("writes a personal AI note when the learner has weak points, and keeps it out of the shared content", async () => {
    const { store, svc } = setup();
    store.weak = ["לא הסביר invalidation"];
    const r = await svc.start("u1", args("t0"));
    expect((r.lesson.personal as Json).note).toBe("שימי לב לאינדקסים");
    expect(JSON.stringify(store.templates[0].content)).not.toContain("invalidation");
  });

  it("gives learners outside the rollout a personal lesson", async () => {
    const { store, gen, svc } = setup();
    store.percent = 0;
    const r = await svc.start("u1", args("t0"));
    expect(r.source).toBe("personal");
    expect(gen.personal).toHaveBeenCalledTimes(1);
    expect(store.templates).toHaveLength(0);
  });

  it("refuses another learner's topic", async () => {
    const { svc } = setup();
    await expect(svc.start("u2", args("t0"))).rejects.toThrow("הנושא לא נמצא");
  });

  it("frees the key when generation fails", async () => {
    const { store, gen, svc } = setup();
    gen.body.mockRejectedValueOnce(new Error("model down"));
    await expect(svc.start("u1", args("t0"))).rejects.toThrow("model down");
    expect(store.templates[0].status).toBe("failed");
    expect((await svc.start("u1", args("t0"))).source).toBe("generated");
  });
});

it("rollout buckets are stable and spread out", () => {
  expect(rolloutBucket("abc")).toBe(rolloutBucket("abc"));
  const buckets = Array.from({ length: 1000 }, (_, i) => rolloutBucket(`user-${i}`));
  const under10 = buckets.filter((b) => b < 10).length;
  expect(under10).toBeGreaterThan(60);
  expect(under10).toBeLessThan(140);
});
