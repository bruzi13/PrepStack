// Calendar dates in the learner's own time zone. `toISOString()` would give the UTC date, which is a day off
// around midnight, so every "which day is it" question goes through here.
export class Calendar {
  static readonly MS_PER_DAY = 86_400_000;

  /** A date as YYYY-MM-DD in the local time zone. */
  static localDate(value: Date | string = new Date()): string {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  static today(): string {
    return Calendar.localDate();
  }

  /** The local date `days` days from today. */
  static daysFromToday(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + Math.round(days));
    return Calendar.localDate(date);
  }

  /** Start of the current week (Sunday, local midnight) as an ISO timestamp. */
  static startOfWeek(): string {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date.toISOString();
  }

  /** Whole days from now until a date; negative once it has passed. */
  static daysUntil(date: string): number {
    return Math.ceil((new Date(date).getTime() - Date.now()) / Calendar.MS_PER_DAY);
  }

  /** Consecutive days, ending today or yesterday, on which at least one of the timestamps falls. */
  static streakLength(timestamps: string[]): number {
    const activeDays = new Set(timestamps.map((timestamp) => Calendar.localDate(timestamp)));
    const cursor = new Date();
    if (!activeDays.has(Calendar.localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (activeDays.has(Calendar.localDate(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  /** "יום שלישי, 17 בנובמבר" */
  static longHebrewDate(date = new Date()): string {
    return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(date);
  }
}
