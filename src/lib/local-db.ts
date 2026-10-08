import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.LOCAL_DATABASE_URL ||
  import.meta.env.DATABASE_URL ||
  import.meta.env.LOCAL_DATABASE_URL;

export const localDb = connectionString
  ? new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  if (!localDb) throw new Error('DATABASE_URL non configurato.');
  return localDb.query<T>(text, params);
}
