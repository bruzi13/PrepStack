// A learner's topics, with the questions screens ask about them as a whole.
import type { Track } from "./records";
import type { Topic } from "./Topic";

export interface ModuleProgress {
  name: string;
  track: Track;
  studiedCount: number;
  totalCount: number;
  averageMastery: number;
}

export class TopicList {
  constructor(readonly items: readonly Topic[]) {}

  get size(): number { return this.items.length; }
  get isEmpty(): boolean { return this.items.length === 0; }
  get studiedCount(): number { return this.items.filter((topic) => topic.isStudied).length; }
  get titles(): string[] { return this.items.map((topic) => topic.title); }

  find(topicId: string): Topic | undefined {
    return this.items.find((topic) => topic.id === topicId);
  }

  onTrack(track: Track): TopicList {
    return new TopicList(this.items.filter((topic) => topic.track === track));
  }

  inPlans(planIds: Set<string>): TopicList {
    return new TopicList(this.items.filter((topic) => planIds.has(topic.planId)));
  }

  /** Studied topics whose review date has come, weakest first. */
  dueForReview(): Topic[] {
    return this.items.filter((topic) => topic.isDueForReview()).sort((a, b) => a.mastery - b.mastery);
  }

  /** The next topic never studied: main track first, then in plan order. */
  nextToStudy(excludeId?: string): Topic | undefined {
    return this.items
      .filter((topic) => !topic.isStudied && topic.id !== excludeId)
      .sort((a, b) => (a.track === b.track ? a.order - b.order : a.track === "main" ? -1 : 1))[0];
  }

  /** Average mastery weighted by priority, 0-100. */
  readiness(): number {
    const totalWeight = this.items.reduce((sum, topic) => sum + topic.importanceWeight, 0);
    if (!totalWeight) return 0;
    return Math.round(this.items.reduce((sum, topic) => sum + topic.mastery * topic.importanceWeight, 0) / totalWeight);
  }

  moduleNames(): string[] {
    return [...new Set(this.items.map((topic) => topic.moduleName))];
  }

  inModule(moduleName: string): Topic[] {
    return this.items.filter((topic) => topic.moduleName === moduleName);
  }

  /** Progress per module, keeping the two tracks' modules apart. */
  moduleProgress(): ModuleProgress[] {
    const groups = new Map<string, Topic[]>();
    for (const topic of this.items) {
      const groupKey = `${topic.track}|${topic.moduleName}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), topic]);
    }
    return [...groups.values()].map((topics) => ({
      name: topics[0].moduleName,
      track: topics[0].track,
      studiedCount: topics.filter((topic) => topic.isStudied).length,
      totalCount: topics.length,
      averageMastery: Math.round(topics.reduce((sum, topic) => sum + topic.mastery, 0) / topics.length),
    }));
  }

  /** Suggested topics whose title is not in the list yet. */
  withoutExisting<T extends { title: string }>(suggestions: T[]): T[] {
    const existing = new Set(this.titles);
    return suggestions.filter((suggestion) => !existing.has(suggestion.title));
  }
}
