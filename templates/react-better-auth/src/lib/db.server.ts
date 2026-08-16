import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const sqlite = createClient({ url: 'file:sqlite.db' });
export const db = drizzle(sqlite, { schema });
