import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileSystem } from '@ecopages/file-system';
import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

const { openBrowser } = vi.hoisted(() => ({ openBrowser: vi.fn<(url: string) => Promise<void>>() }));
vi.mock('open', () => ({ default: openBrowser }));

it.live('only the initiating webview can redeem a successful GitHub sign-in once', () =>
	Effect.gen(function* () {
		const dataDir = yield* Effect.acquireRelease(
			Effect.sync(() => fileSystem.mkdtemp(join(fileSystem.tempDir(), 'ecopages-desktop-auth-'))),
			(dir) => Effect.sync(() => fileSystem.remove(dir)),
		);
		vi.stubEnv('WORKSPACE_DATA_DIR', dataDir);
		vi.stubEnv('ECOPAGES_PORT', '3210');
		vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client');
		vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret');
		const existingSecret = 'existing-auth-secret-used-by-the-desktop-app';
		const databasePath = join(dataDir, 'auth.sqlite');
		const existingDatabase = new DatabaseSync(databasePath);
		try {
			existingDatabase.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
			existingDatabase.prepare('INSERT INTO app_settings VALUES (?, ?)').run('auth_secret', existingSecret);
		} finally {
			existingDatabase.close();
		}
		let browserUrl = '';
		openBrowser.mockImplementation(async (url) => {
			browserUrl = url;
		});
		vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input);
			switch (url) {
				case 'https://github.com/login/oauth/access_token':
					expect(String(init?.body)).toContain('code_verifier=');
					return Response.json({ access_token: 'test-access-token', token_type: 'bearer' });
				case 'https://api.github.com/user':
					return Response.json({ id: 42, login: 'octocat', name: 'Octocat', email: 'octocat@example.test' });
				case 'https://api.github.com/user/emails':
					return Response.json([{ email: 'octocat@example.test', primary: true, verified: true }]);
				default:
					throw new Error(`Unexpected fetch to ${url}`);
			}
		});

		const { startGithub, launchGithub, finishGithub, claimGithub } = yield* Effect.promise(
			() => import('../src/lib/github.server'),
		);
		const { authClient, authRuntime, readSession } = yield* Effect.promise(() => import('../src/lib/auth.server'));
		yield* Effect.addFinalizer(() => Effect.promise(() => authRuntime.dispose()));
		const [firstAuth, secondAuth] = yield* Effect.promise(() =>
			Promise.all([authRuntime.runPromise(authClient), authRuntime.runPromise(authClient)]),
		);
		expect(firstAuth).toBe(secondAuth);
		expect(firstAuth.options.secret).toBe(existingSecret);
		const { origin } = yield* Effect.promise(() => import('../src/lib/settings'));
		const host = new URL(origin).host;
		const started = yield* Effect.promise(() =>
			startGithub({
				request: new Request(`${origin}/auth/github/start`, {
					method: 'POST',
					headers: { Host: host, Origin: origin },
				}),
			}),
		);
		expect(started.status).toBe(200);
		const flow = yield* Effect.promise(() => started.json());
		if (!browserUrl) throw new Error('Expected sign-in to open the system browser.');
		const launched = yield* Effect.promise(() =>
			launchGithub({ request: new Request(browserUrl, { headers: { Host: host } }) }),
		);
		expect(launched.status).toBe(303);
		const authorization = new URL(launched.headers.get('location')!);
		expect(authorization.origin).toBe('https://github.com');
		expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');

		const claim = (proof: string, requestOrigin = origin) =>
			Effect.promise(() =>
				claimGithub({
					request: new Request(`${origin}/auth/github/claim`, {
						method: 'POST',
						headers: { Host: host, Origin: requestOrigin, 'Content-Type': 'application/json' },
						body: JSON.stringify({ id: flow.id, proof }),
					}),
				}),
			);
		expect((yield* claim(flow.proof)).status).toBe(202);
		const callback = new URL('/api/auth/callback/github', origin);
		callback.searchParams.set('code', 'test-oauth-code');
		callback.searchParams.set('state', authorization.searchParams.get('state')!);
		const cookies = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((value) => value.split(';')[0])
				.join('; ');
		const finished = yield* Effect.promise(() =>
			finishGithub({
				request: new Request(callback, { headers: { Host: host, Cookie: cookies(launched) } }),
			}),
		);
		expect(yield* Effect.promise(() => finished.text())).toContain('Signed in.');
		expect(finished.headers.getSetCookie()).toEqual([]);
		expect((yield* claim(flow.proof, 'https://example.com')).status).toBe(403);
		expect((yield* claim('incorrect-proof')).status).toBe(410);

		const claims = yield* Effect.all([claim(flow.proof), claim(flow.proof)], { concurrency: 2 });
		expect(claims.map((response) => response.status).sort()).toEqual([204, 410]);
		const claimed = claims.find((response) => response.status === 204);
		if (!claimed) throw new Error('Expected one successful claim.');
		const session = yield* Effect.promise(() =>
			authRuntime.runPromise(readSession(new Headers({ Cookie: cookies(claimed) }))),
		);
		expect(session?.user.email).toBe('octocat@example.test');
		expect((yield* claim(flow.proof)).status).toBe(410);
	}),
);
