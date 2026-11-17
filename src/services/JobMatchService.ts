// Comparing a job description with the learner's profile.
import type { AiEngine } from "@/ai/AiEngine";
import type { JobAnalysis } from "@/domain/records";

export class JobMatchService {
  constructor(private readonly ai: AiEngine) {}

  analyse(jobDescription: string): Promise<JobAnalysis> {
    return this.ai.runJob("jd", { text: jobDescription });
  }
}
