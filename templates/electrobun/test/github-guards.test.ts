import { join } from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const { openBrowser } = vi.hoisted(() => ({ openBrowser: vi.fn<(url: string) => Promise<void>>() }));
vi.mock('open', () => ({ default: openBrowser }));

const origin = 'http://127.0.0.1:3210';
const host = '127.0.0.1:3210';
let dataDir = '';
let github: typeof import('../src/lib/github.server');
let auth: typeof import('../src/lib/auth.server');

const start = (headers: Record<string, string> = { Host: host, Origin: origin }) =>
	github.startGithub({ request: new Request(`${origin}/auth/github/start`, { method: 'POST', headers }) });

const claim = (id: string, proof: string) =>
	github.claimGithub({
		request: new Request(`${origin}/auth/github/claim`, {
			method: 'POST',
			headers: { Host: host, Origin: origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, proof }),
		}),
	});

beforeAll(async () => {
	dataDir = fileSystem.mkdtemp(join(fileSystem.tempDir(), 'ecopages-desktop-guards-'));
	vi.stubEnv('WORKSPACE_DATA_DIR', dataDir);
	vi.stubEnv('ECOPAGES_PORT', '3210');
	vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client');
	vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret');
	github = await import('../src/lib/github.server');
	auth = await import('../src/lib/auth.server');
});

afterAll(async () => {
	vi.useRealTimers();
	await auth.authRuntime.dispose();
	fileSystem.remove(dataDir);
});

it('refuses to start a sign-in from a foreign or missing Origin', async () => {
	openBrowser.mockResolvedValue();
	expect((await start({ Host: host, Origin: 'https://example.com' })).status).toBe(403);
	expect((await start({ Host: host })).status).toBe(403);
	expect(openBrowser).not.toHaveBeenCalled();
});

it('expires a launch link for a foreign Host, a replay, and an unknown flow', async () => {
	let browserUrl = '';
	openBrowser.mockImplementation(async (url) => {
		browserUrl = url;
	});
	expect((await start()).status).toBe(200);
	const foreignHost = await github.launchGithub({
		request: new Request(browserUrl, { headers: { Host: 'evil.test:3210' } }),
	});
	expect(foreignHost.status).toBe(410);
	const first = await github.launchGithub({ request: new Request(browserUrl, { headers: { Host: host } }) });
	expect(first.status).toBe(303);
	const replay = await github.launchGithub({ request: new Request(browserUrl, { headers: { Host: host } }) });
	expect(replay.status).toBe(410);
	const unknown = await github.launchGithub({
		request: new Request(`${origin}/auth/github/launch?id=missing`, { headers: { Host: host } }),
	});
	expect(unknown.status).toBe(410);
});

it('rejects a callback from a foreign Host', async () => {
	const response = await github.finishGithub({
		request: new Request(`${origin}/api/auth/callback/github`, { headers: { Host: 'evil.test:3210' } }),
	});
	expect(response.status).toBe(403);
});

it('removes the flow and answers 502 when the system browser cannot open', async () => {
	openBrowser.mockRejectedValueOnce(new Error('no browser'));
	expect((await start()).status).toBe(502);
});

it('caps pending flows at 16 and frees them once they expire', async () => {
	openBrowser.mockResolvedValue();
	vi.useFakeTimers({ toFake: ['Date'] });
	try {
		vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
		const created: Array<{ id: string; proof: string }> = [];
		let status = 200;
		for (let attempt = 0; attempt < 20 && status === 200; attempt += 1) {
			const response = await start();
			status = response.status;
			if (status === 200) created.push(await response.json());
		}
		expect(status).toBe(429);

		const [flow] = created;
		expect((await claim(flow.id, flow.proof)).status).toBe(202);
		vi.setSystemTime(new Date('2030-01-01T00:06:00Z'));
		expect((await claim(flow.id, flow.proof)).status).toBe(410);
		expect((await start()).status).toBe(200);
	} finally {
		vi.useRealTimers();
	}
});
