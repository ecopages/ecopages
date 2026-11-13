import { createApp } from '@ecopages/core/create-app';
import { authClient, authRuntime } from './src/lib/auth.server';
import { signOut, submitCredentials } from './src/lib/forms.server';
import { claimGithub, finishGithub, launchGithub, startGithub } from './src/lib/github.server';
import { hostname, port } from './src/lib/settings';

const app = await createApp({ serverOptions: { hostname, port } });

app.post('/auth/credentials', submitCredentials)
	.post('/auth/sign-out', signOut)
	.post('/auth/github/start', startGithub)
	.get('/auth/github/launch', launchGithub)
	.get('/api/auth/callback/github', finishGithub)
	.post('/auth/github/claim', claimGithub);

const readinessPath = process.env.WORKSPACE_DEV_READY_PATH;
if (readinessPath) app.get(readinessPath, () => new Response(null, { status: 204 }));
try {
	if (process.env.WORKSPACE_DESKTOP === '1') await authRuntime.runPromise(authClient);
	await app.start();
} catch (error) {
	await authRuntime.dispose();
	throw error;
}
