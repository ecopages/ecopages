import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/commerce/drizzle/schema.ts',
	out: './src/lib/commerce/drizzle/migrations',
	dialect: 'sqlite',
});
