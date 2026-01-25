import { betterAuth } from 'better-auth';
import { db } from './shared-db';

export const auth = betterAuth({
	database: db,
	emailAndPassword: {
		enabled: true,
	},
});
