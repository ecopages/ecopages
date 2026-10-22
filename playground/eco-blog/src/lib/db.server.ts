import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/** libSQL URL of the blog database; tests point it at their own file. */
export const databaseUrl = process.env.DATABASE_URL ?? 'file:sqlite.db';

export const db = drizzle(createClient({ url: databaseUrl }), { schema });
