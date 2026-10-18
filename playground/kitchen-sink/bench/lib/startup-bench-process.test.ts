import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { hasProcessExited, stopChildProcess, waitForProcessExit } from './startup-bench-process.mjs';

const children: ReturnType<typeof spawn>[] = [];

function spawnNode(source: string) {
	const child = spawn(process.execPath, ['-e', source], { stdio: 'ignore' });
	children.push(child);
	return child;
}

async function waitForSpawn(child: ReturnType<typeof spawn>) {
	await new Promise<void>((resolve) => child.once('spawn', resolve));
}

describe('startup-bench-process', () => {
	afterEach(() => {
		for (const child of children.splice(0)) {
			child.kill('SIGKILL');
		}
	});

	it('stops a child that dies of SIGTERM without waiting for the timeout', async () => {
		const child = spawnNode('setInterval(() => {}, 1000)');
		await waitForSpawn(child);

		const startedAt = performance.now();
		await stopChildProcess(child, 10_000);

		expect(performance.now() - startedAt).toBeLessThan(5_000);
		expect(child.exitCode).toBeNull();
		expect(child.signalCode).toBe('SIGTERM');
	});

	it('kills a child that ignores SIGTERM once the timeout passes', async () => {
		const child = spawnNode(`process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`);
		await waitForSpawn(child);
		await new Promise((resolve) => setTimeout(resolve, 300));

		await stopChildProcess(child, 300);

		expect(child.signalCode).toBe('SIGKILL');
	});

	it('resolves immediately with the signal for a child that already died of one', async () => {
		const child = spawnNode('setInterval(() => {}, 1000)');
		await waitForSpawn(child);
		child.kill('SIGTERM');
		await new Promise((resolve) => child.once('exit', resolve));

		expect(hasProcessExited(child)).toBe(true);
		await expect(waitForProcessExit(child)).resolves.toEqual({ code: null, signal: 'SIGTERM' });
	});

	it('reports the exit code of a child that exits on its own', async () => {
		const child = spawnNode('process.exit(3)');

		await expect(waitForProcessExit(child)).resolves.toEqual({ code: 3, signal: null });
	});
});
