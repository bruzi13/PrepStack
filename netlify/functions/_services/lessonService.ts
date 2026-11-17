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

const contentHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const learnerBrief = (learner: { display_name: string; answers: Json }) => ({ name: learner.display_name, ...learner.answers });

export class LessonService {
  constructor(private readonly store: LessonStore, private readonly generator: LessonGenerator, private readonly clock: Clock) {}

  async start(userId: string, args: StartArgs): Promise<StartResult> {
    const topic = await this.store.topic(userId, args.topicId);
    if (!topic) throw new UserError("הנושא לא נמצא.", 404);
    const learner = await this.store.learner(userId);
    const weakPoints = await this.store.lastWeakPoints(userId, topic.id);
    const isReview = topic.reviews > 0;
    const lessonFields = { user_id: userId, topic_id: topic.id, topic_kind: topic.kind, format: args.format, status: "ready", choice: args.choice ?? null };

    const usesSharedCache = !!topic.topic_key && inRollout(userId, await this.store.cachePercent());
    const catalog = usesSharedCache ? await this.store.catalog(topic.topic_key!) : null;
    if (!catalog) {
      const content = await this.generator.personal(topic, args.format, learnerBrief(learner), isReview, weakPoints);
      return { lesson: await this.store.insertLesson({ ...lessonFields, content }), source: "personal" };
    }

    const key: TemplateKey = {
      topic_key: catalog.topic_key, format: args.format, level_band: levelBand(learner.answers.level), lang: "he",
      variant: isReview ? "review" : "full", prompt_version: PROMPT_VERSION,
    };
    const { template, generated, after } = await this.template(key, catalog);
    const { about, testType } = this.generator.about(catalog, { band: key.level_band });

    const bank = await this.store.tests(template.id);
    const picked = pickTest(bank.map((bankTest) => bankTest.id), await this.store.seenTests(userId, template.id));
    const test = "id" in picked ? bank.find((bankTest) => bankTest.id === picked.id)! : await this.store.addTest(template.id, await this.generator.test(about, testType));

    const note = weakPoints.length ? await this.generator.note(topic.title, weakPoints, learnerBrief(learner)) : "";
    const content = { ...template.content, test: test.test };
    const lesson = await this.store.insertLesson({ ...lessonFields, content, template_id: template.id, test_id: test.id, personal: note ? { note, weak_points: weakPoints } : null });
    await this.store.bumpUses(template.id, test.id);
    log("info", "lesson.start", { source: generated ? "generated" : "cache", template: template.id, band: key.level_band, variant: key.variant });
    return { lesson, source: generated ? "generated" : "cache", after };
  }

  /** Find or make the template for a key: hit, stale-while-revalidate, single-flight miss, or wait for another. */
  private async template(key: TemplateKey, catalog: { title: string; description: string; kind: string }): Promise<{ template: Template; generated: boolean; after?: () => Promise<void> }> {
    const deadline = this.clock.now() + WAIT_MS;
    for (;;) {
      const ready = await this.store.findTemplate(key, "ready");
      if (ready) return { template: ready, generated: false };
      const stale = await this.store.findTemplate(key, "stale");
      const claimed = await this.store.claim(key, LEASE_MS, (stale?.version ?? 0) + 1);
      if (claimed && stale) {
        // Serve the old version now; regenerate after the learner already has their lesson.
        return { template: stale, generated: false, after: () => this.generate(claimed, key, catalog, stale.id).then(() => undefined) };
      }
      if (claimed) return { template: await this.generate(claimed, key, catalog), generated: true };
      if (stale) return { template: stale, generated: false };

      const inProgress = await this.store.findTemplate(key, "generating");
      if (inProgress?.lease_until && Date.parse(inProgress.lease_until) < this.clock.now() && (await this.store.takeOver(inProgress.id, LEASE_MS))) {
        return { template: await this.generate(inProgress, key, catalog), generated: true };
      }
      if (this.clock.now() > deadline) throw new UserError("השיעור עדיין בהכנה אצל לומד אחר. נסו שוב בעוד דקה.", 503);
      await this.clock.sleep(POLL_MS);
    }
  }

  private async generate(row: Template, key: TemplateKey, catalog: { title: string; description: string; kind: string }, replaces?: string): Promise<Template> {
    const { about, testType } = this.generator.about(catalog, { band: key.level_band as LevelBand });
    try {
      const [body, ...tests] = await Promise.all([
        this.generator.body(about, key.format),
        ...Array.from({ length: TESTS_INITIAL }, () => this.generator.test(about, testType)),
      ]);
      await this.store.completeTemplate(row.id, body, contentHash(body));
      for (const test of tests) await this.store.addTest(row.id, test);
      if (replaces) await this.store.retire(replaces);
      log("info", "template.generated", { template: row.id, key, tests: tests.length });
      return { ...row, status: "ready", content: body };
    } catch (failure) {
      await this.store.failTemplate(row.id);
      throw failure;
    }
  }
}

export type { TopicRow };
