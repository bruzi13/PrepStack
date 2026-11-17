// Composition root: the one place that decides which implementations the app runs on (Supabase and the
// Netlify functions, or the in-browser demo) and wires every service to its dependencies.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@shared/config";
import type { AiEngine } from "@/ai/AiEngine";
import { DemoAiEngine } from "@/ai/demo/DemoAiEngine";
import { ServerAiEngine } from "@/ai/ServerAiEngine";
import { DemoAuthService, SupabaseAuthService, type AuthService } from "@/data/AuthService";
import { BrowserDemoDatabase, SupabaseDatabase, type Database } from "@/data/Database";
import { DemoMaintainerBoardApi, ServerMaintainerBoardApi, type MaintainerBoardApi } from "@/data/MaintainerBoardApi";
import { FeedbackRepository } from "@/data/repositories/FeedbackRepository";
import { InterviewRepository } from "@/data/repositories/InterviewRepository";
import { LessonRepository } from "@/data/repositories/LessonRepository";
import { MistakeRepository } from "@/data/repositories/MistakeRepository";
import { MaintainerRepository } from "@/data/repositories/MaintainerRepository";
import { PlanRepository } from "@/data/repositories/PlanRepository";
import { ProfileRepository } from "@/data/repositories/ProfileRepository";
import { TopicRepository } from "@/data/repositories/TopicRepository";
import { CodeRunner } from "@/services/CodeRunner";
import { ConsoleErrorReporter, ServerErrorReporter, type ErrorReporter } from "@/services/ErrorReporter";
import { InterviewService } from "@/services/InterviewService";
import { JobMatchService } from "@/services/JobMatchService";
import { OnboardingService } from "@/services/OnboardingService";
import { PlanService } from "@/services/PlanService";
import { PracticeService } from "@/services/PracticeService";
import { ProgressService } from "@/services/ProgressService";
import { StudyService } from "@/services/StudyService";

export interface AppServices {
  /** Demo mode (npm run demo): sample content, data kept in this browser only. */
  isDemo: boolean;
  auth: AuthService;
  profiles: ProfileRepository;
  maintainers: MaintainerRepository;
  maintainerBoard: MaintainerBoardApi;
  plans: PlanService;
  study: StudyService;
  interviews: InterviewService;
  progress: ProgressService;
  practice: PracticeService;
  onboarding: OnboardingService;
  errorReporter: ErrorReporter;
  codeRunner: CodeRunner;
  jobMatch: JobMatchService;
}

export function createAppServices(isDemo: boolean): AppServices {
  let database: Database, auth: AuthService, ai: AiEngine, maintainerBoard: MaintainerBoardApi, errorReporter: ErrorReporter;
  if (isDemo) {
    database = new BrowserDemoDatabase();
    auth = new DemoAuthService();
    ai = new DemoAiEngine(database, DemoAuthService.USER_ID);
    maintainerBoard = new DemoMaintainerBoardApi();
    errorReporter = new ConsoleErrorReporter();
  } else {
    // One storage key per Supabase project, so a session from another project is never reused.
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: `prepstack-auth-${projectRef}` },
    });
    database = new SupabaseDatabase(client);
    auth = new SupabaseAuthService(client);
    ai = new ServerAiEngine(auth, database);
    maintainerBoard = new ServerMaintainerBoardApi(auth);
    errorReporter = new ServerErrorReporter(auth);
  }

  const topics = new TopicRepository(database);
  const plans = new PlanRepository(database);
  const lessons = new LessonRepository(database);
  const feedback = new FeedbackRepository(database);
  const interviews = new InterviewRepository(database);
  const mistakes = new MistakeRepository(database);
  const planService = new PlanService(ai, plans, topics);
  const practice = new PracticeService(mistakes, lessons);

  return {
    isDemo,
    auth,
    profiles: new ProfileRepository(database),
    maintainers: new MaintainerRepository(database, isDemo),
    maintainerBoard,
    plans: planService,
    study: new StudyService(ai, topics, lessons, feedback, practice),
    interviews: new InterviewService(ai, interviews, practice),
    progress: new ProgressService(topics, lessons, interviews, feedback, plans, mistakes),
    practice,
    onboarding: new OnboardingService(ai, planService),
    errorReporter,
    codeRunner: new CodeRunner(),
    jobMatch: new JobMatchService(ai),
  };
}
