// Table access behind one interface, so repositories do not care whether rows live in Supabase or, in demo mode,
// in this browser's localStorage.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, any>;

export interface QueryOptions {
  /** Column equals value, for every entry. */
  where?: Record<string, unknown>;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}

export interface Database {
  select<T = Row>(table: string, options?: QueryOptions): Promise<T[]>;
  insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]>;
  upsert<T = Row>(table: string, row: Row): Promise<T>;
  update(table: string, id: string, patch: Row): Promise<void>;
  delete(table: string, where: Record<string, unknown>): Promise<void>;
  /** Call a database function; demo mode returns `fallback`. */
  callFunction<T>(name: string, fallback: T): Promise<T>;
}

/** Turns Supabase error text into a message a learner can act on (Hebrew). */
function friendlyDatabaseError(message: string, onExpiredSession: () => void): string {
  if (/JWT|wrong key type|suitable key/i.test(message)) { onExpiredSession(); return "פג תוקף ההתחברות. רעננו את הדף והתחברו מחדש."; }
  if (/does not exist|schema cache/i.test(message)) return "טבלאות האתר עדיין לא הוקמו בדאטהבייס (צריך להריץ את supabase/schema.sql).";
  if (/fetch|network/i.test(message)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return message;
}

export class SupabaseDatabase implements Database {
  constructor(private readonly client: SupabaseClient) {}

  private fail(message: string): never {
    throw new Error(friendlyDatabaseError(message, () => void this.client.auth.signOut({ scope: "local" })));
  }

  async select<T = Row>(table: string, options: QueryOptions = {}): Promise<T[]> {
    let query = this.client.from(table).select("*");
    for (const [column, value] of Object.entries(options.where ?? {})) query = query.eq(column, value as never);
    if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending !== false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) this.fail(error.message);
    return (data ?? []) as T[];
  }

  async insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
    const { data, error } = await this.client.from(table).insert(Array.isArray(rows) ? rows : [rows]).select();
    if (error) this.fail(error.message);
    return (data ?? []) as T[];
  }

  async upsert<T = Row>(table: string, row: Row): Promise<T> {
    const { data, error } = await this.client.from(table).upsert(row).select().single();
    if (error) this.fail(error.message);
    return data as T;
  }

  async update(table: string, id: string, patch: Row): Promise<void> {
    const { error } = await this.client.from(table).update(patch).eq("id", id);
    if (error) this.fail(error.message);
  }

  async delete(table: string, where: Record<string, unknown>): Promise<void> {
    let query = this.client.from(table).delete();
    for (const [column, value] of Object.entries(where)) query = query.eq(column, value as never);
    const { error } = await query;
    if (error) this.fail(error.message);
  }

  async callFunction<T>(name: string, fallback: T): Promise<T> {
    const { data, error } = await this.client.rpc(name);
    return error ? fallback : ((data ?? fallback) as T);
  }
}

/** Demo mode: every table is a JSON array in localStorage, so the site works with no backend. */
export class BrowserDemoDatabase implements Database {
  static readonly KEY_PREFIX = "prep-demo:";

  private read(table: string): Row[] {
    try { return JSON.parse(localStorage.getItem(BrowserDemoDatabase.KEY_PREFIX + table) ?? "") as Row[]; } catch { return []; }
  }

  private write(table: string, rows: Row[]): void {
    try { localStorage.setItem(BrowserDemoDatabase.KEY_PREFIX + table, JSON.stringify(rows)); } catch { /* storage full or blocked */ }
  }

  private static matches(row: Row, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([column, value]) => row[column] === value);
  }

  async select<T = Row>(table: string, options: QueryOptions = {}): Promise<T[]> {
    let rows = this.read(table).filter((row) => BrowserDemoDatabase.matches(row, options.where));
    if (options.orderBy) {
      const column = options.orderBy, direction = options.ascending === false ? -1 : 1;
      rows = rows.sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * direction);
    }
    return (options.limit ? rows.slice(0, options.limit) : rows) as T[];
  }

  async insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
    const createdAt = new Date().toISOString();
    const inserted = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ id: crypto.randomUUID(), created_at: createdAt, ...row }));
    this.write(table, [...this.read(table), ...inserted]);
    return inserted as T[];
  }

  async upsert<T = Row>(table: string, row: Row): Promise<T> {
    const rows = this.read(table);
    const index = rows.findIndex((existing) => existing.id === row.id);
    const merged = { created_at: new Date().toISOString(), ...(index >= 0 ? rows[index] : {}), ...row };
    if (index >= 0) rows[index] = merged; else rows.push(merged);
    this.write(table, rows);
    return merged as T;
  }

  async update(table: string, id: string, patch: Row): Promise<void> {
    this.write(table, this.read(table).map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async delete(table: string, where: Record<string, unknown>): Promise<void> {
    this.write(table, this.read(table).filter((row) => !BrowserDemoDatabase.matches(row, where)));
  }

  async callFunction<T>(_name: string, fallback: T): Promise<T> {
    return fallback;
  }
}
