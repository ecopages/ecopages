import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-each-project.mjs');

describe('run-each-project', () => {
	it('requires at least one project name', () => {
		const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('at least one Playwright project name');
	});
});
