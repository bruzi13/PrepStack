import type { Database } from "../Database";

/** Who may open the maintainer board. The server checks again on every board request. */
export class MaintainerRepository {
  constructor(private readonly database: Database, private readonly everyoneIsMaintainer = false) {}

  async isMaintainer(userId: string): Promise<boolean> {
    if (this.everyoneIsMaintainer) return true;
    try {
      const rows = await this.database.select("prep_maintainers", { where: { user_id: userId }, limit: 1 });
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
