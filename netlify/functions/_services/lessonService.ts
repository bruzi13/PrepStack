// Starting a lesson. Learners in the cache rollout whose topic is in the shared catalog get the shared lesson
// body for their key (generated once, ever), a bank test they have not seen, and a personal AI note about their
// own weak points. Everyone else gets a fully personal lesson, as before.
import { createHash } from "node:crypto";
import { inRollout, levelBand, pickTest, PROMPT_VERSION, TESTS_INITIAL, type LevelBand } from "../../../shared/lessonKeys";
import { UserError } from "../_core/errors";
import { log } from "../_core/context";
import type { Clock, Json, LessonGenerator, LessonRow, LessonStore, Template, TemplateKey, TopicRow } from "./ports";

const LEASE_MS = 10 * 60_000;      // a generation that has not finished in 10 minutes is presumed dead
const WAIT_MS = 6 * 60_000;        // how long a second request waits for someone else's generation
const POLL_MS = 3000;

export interface StartArgs { topicId: string; format: string; manual: boolean; choice?: unknown }
export interface StartResult { lesson: LessonRow; source: "cache" | "generated" | "personal"; after?: () => Promise<void> }

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const learnerBrief = (l: { display_name: string; answers: Json }) => ({ name: l.display_name, ...l.answers });

export class LessonService {
  constructor(private store: LessonStore, private gen: LessonGenerator, private clock: Clock) {}

  async start(userId: string, args: StartArgs): Promise<StartResult> {
    const topic = await this.store.topic(userId, args.topicId);
    if (!topic) throw new UserError("הנושא לא נמצא.", 404);
    const learner = await this.store.learner(userId);
    const weak = await this.store.lastWeakPoints(userId, topic.id);
    const review = topic.reviews > 0;
    const base = { user_id: userId, topic_id: topic.id, topic_kind: topic.kind, format: args.format, status: "ready", choice: args.choice ?? null };

    const cached = !!topic.topic_key && inRollout(userId, await this.store.cachePercent());
    const catalog = cached ? await this.store.catalog(topic.topic_key!) : null;
    if (!catalog) {
      const content = await this.gen.personal(topic, args.format, learnerBrief(learner), review, weak);
      return { lesson: await this.store.insertLesson({ ...base, content }), source: "personal" };
    }

    const key: TemplateKey = {
      topic_key: catalog.topic_key, format: args.format, level_band: levelBand(learner.answers.level), lang: "he",
      variant: review ? "review" : "full", prompt_version: PROMPT_VERSION,
    };
    const { tpl, generated, after } = await this.template(key, catalog);
    const { about, testType } = this.gen.about(catalog, { band: key.level_band });

    const bank = await this.store.tests(tpl.id);
    const pick = pickTest(bank.map((t) => t.id), await this.store.seenTests(userId, tpl.id));
    const test = "id" in pick ? bank.find((t) => t.id === pick.id)! : await this.store.addTest(tpl.id, await this.gen.test(about, testType));

    const note = weak.length ? await this.gen.note(topic.title, weak, learnerBrief(learner)) : "";
    const content = { ...tpl.content, test: test.test };
    const lesson = await this.store.insertLesson({ ...base, content, template_id: tpl.id, test_id: test.id, personal: note ? { note, weak_points: weak } : null });
    await this.store.bumpUses(tpl.id, test.id);
    log("info", "lesson.start", { source: generated ? "generated" : "cache", template: tpl.id, band: key.level_band, variant: key.variant });
    return { lesson, source: generated ? "generated" : "cache", after };
  }

  /** Find or make the template for a key: hit, stale-while-revalidate, single-flight miss, or wait for another. */
  private async template(key: TemplateKey, catalog: { title: string; description: string; kind: string }): Promise<{ tpl: Template; generated: boolean; after?: () => Promise<void> }> {
    const deadline = this.clock.now() + WAIT_MS;
    for (;;) {
      const ready = await this.store.findTemplate(key, "ready");
      if (ready) return { tpl: ready, generated: false };
      const stale = await this.store.findTemplate(key, "stale");
      const claimed = await this.store.claim(key, LEASE_MS, (stale?.version ?? 0) + 1);
      if (claimed && stale) {
        // Serve the old version now; regenerate after the learner already has their lesson.
        return { tpl: stale, generated: false, after: () => this.generate(claimed, key, catalog, stale.id).then(() => undefined) };
      }
      if (claimed) return { tpl: await this.generate(claimed, key, catalog), generated: true };
      if (stale) return { tpl: stale, generated: false };

      const live = await this.store.findTemplate(key, "generating");
      if (live?.lease_until && Date.parse(live.lease_until) < this.clock.now() && (await this.store.takeOver(live.id, LEASE_MS))) {
        return { tpl: await this.generate(live, key, catalog), generated: true };
      }
      if (this.clock.now() > deadline) throw new UserError("השיעור עדיין בהכנה אצל לומד אחר. נסו שוב בעוד דקה.", 503);
      await this.clock.sleep(POLL_MS);
    }
  }

  private async generate(row: Template, key: TemplateKey, catalog: { title: string; description: string; kind: string }, replaces?: string): Promise<Template> {
    const { about, testType } = this.gen.about(catalog, { band: key.level_band as LevelBand });
    try {
      const [body, ...tests] = await Promise.all([
        this.gen.body(about, key.format),
        ...Array.from({ length: TESTS_INITIAL }, () => this.gen.test(about, testType)),
      ]);
      await this.store.completeTemplate(row.id, body, hash(body));
      for (const t of tests) await this.store.addTest(row.id, t);
      if (replaces) await this.store.retire(replaces);
      log("info", "template.generated", { template: row.id, key, tests: tests.length });
      return { ...row, status: "ready", content: body };
    } catch (e) {
      await this.store.failTemplate(row.id);
      throw e;
    }
  }
}

export type { TopicRow };
