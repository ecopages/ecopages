import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const RESULT_PREFIX = '__SERVER_DOM_ORDER__';
const CASE_SCRIPT = fileURLToPath(new URL('./fixtures/server-dom-order-case.ts', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

type OrderCase = {
	order: 'radiant-then-lit-define' | 'lit-define-then-radiant' | 'lit-define-after-radiant';
	title: string;
};

const ORDERS: OrderCase[] = [
	{
		order: 'radiant-then-lit-define',
		title: 'Radiant then Lit definition: renders',
	},
	{
		order: 'lit-define-then-radiant',
		title: 'Lit definition then Radiant setup: must still render',
	},
	{
		order: 'lit-define-after-radiant',
		title: 'Lit definition after Radiant setup: renders',
	},
];

describe('server DOM module-level orders', () => {
	it.each(ORDERS)(
		'$title',
		async ({ order }) => {
			let stdout = '';
			let stderr = '';
			try {
				const result = await execFileAsync(
					process.execPath,
					['--experimental-strip-types', CASE_SCRIPT, order],
					{
						cwd: REPO_ROOT,
						timeout: 30_000,
					},
				);
				stdout = result.stdout;
				stderr = result.stderr;
			} catch (error) {
				const failed = error as { stdout?: string; stderr?: string };
				stdout = failed.stdout ?? '';
				stderr = failed.stderr ?? String(error);
			}

			const line = stdout
				.split('\n')
				.reverse()
				.find((entry) => entry.startsWith(RESULT_PREFIX));

			expect(line, `missing order result in stdout:\n${stdout}\n${stderr}`).toBeDefined();
			const result = JSON.parse(line!.slice(RESULT_PREFIX.length)) as {
				ok: boolean;
				markup?: string;
				error?: string;
			};

			expect(result.error).toBeUndefined();
			expect(result.ok).toBe(true);
			expect(result.markup).toContain('data-server-dom-lit-probe');
			expect(result.markup).toContain('shadowrootmode');
		},
		30_000,
	);
});
