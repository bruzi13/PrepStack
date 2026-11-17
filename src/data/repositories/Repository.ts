// Base for repositories: one table, rows of type TRecord, returned to callers as domain models of type TModel.
import type { Database, QueryOptions } from "../Database";

export abstract class Repository<TRecord, TModel> {
  protected abstract readonly table: string;

  constructor(protected readonly database: Database) {}

  protected abstract toModel(record: TRecord): TModel;

  protected async findMany(options: QueryOptions = {}): Promise<TModel[]> {
    const records = await this.database.select<TRecord>(this.table, options);
    return records.map((record) => this.toModel(record));
  }

  protected async findOne(where: Record<string, unknown>): Promise<TModel | null> {
    const [record] = await this.database.select<TRecord>(this.table, { where, limit: 1 });
    return record ? this.toModel(record) : null;
  }

  async findById(id: string): Promise<TModel | null> {
    return this.findOne({ id });
  }
}
