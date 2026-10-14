import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { installBuildQueue } from '../build/runtime/build-queue.ts';
import {
	NoopEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { createAppRuntime, requireAppRuntime } from './app-runtime.ts';
import { finalizeEcoPagesConfig } from './finalize-config.ts';

describe('AppRuntime', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function tempRoot(): string {
		const dir = mkdtempSync(path.join(tmpdir(), 'eco-app-runtime-'));
		tempDirs.push(dir);
		return dir;
	}

	it('throws for a config that was never assembled, naming the missing runtime', () => {
		expect(() => requireAppRuntime({} as EcoPagesAppConfig)).toThrow(/Missing app runtime/);
		expect(() => createAppRuntime({ runtime: {} } as EcoPagesAppConfig)).toThrow(/Missing app runtime/);
	});

	it('assembles one runtime for a finalized config and keeps a second config separate', async () => {
		const first = await finalizeEcoPagesConfig({
			rootDir: tempRoot(),
			baseUrl: 'http://first.test',
		});
		const second = await finalizeEcoPagesConfig({
			rootDir: tempRoot(),
			baseUrl: 'http://second.test',
		});
		const firstRuntime = requireAppRuntime(first);
		const secondRuntime = requireAppRuntime(second);

		expect(createAppRuntime(first)).toBe(firstRuntime);
		expect(firstRuntime).not.toBe(secondRuntime);
		expect(firstRuntime.buildInputIndex).not.toBe(secondRuntime.buildInputIndex);
		expect(firstRuntime.origin).toBe('http://first.test');
		expect(firstRuntime.hmr).toBeNull();
		expect(firstRuntime.pageCache).toBeNull();
		expect(firstRuntime.buildAdapter).toBe(first.runtime?.buildAdapter);
		expect(firstRuntime.moduleLoader.getDevelopmentGeneration()).toBe(0);

		firstRuntime.moduleLoader.invalidateDevelopmentGraph();

		expect(firstRuntime.serverInvalidation.currentGeneration()).toBe(1);
		expect(firstRuntime.moduleLoader.getDevelopmentGeneration()).toBe(1);
		expect(secondRuntime.moduleLoader.getDevelopmentGeneration()).toBe(0);
	});

	it('follows a build queue or entrypoint graph installed after finalization', async () => {
		const config = await finalizeEcoPagesConfig({ rootDir: tempRoot() });
		const runtime = requireAppRuntime(config);
		const nextQueue = installBuildQueue(config);
		const nextGraph = new NoopEntrypointDependencyGraph();
		setAppEntrypointDependencyGraph(config, nextGraph);

		expect(runtime.buildQueue).toBe(nextQueue);
		expect(runtime.buildQueue).toBe(config.runtime?.buildQueue);
		expect(runtime.entrypointDependencyGraph).toBe(nextGraph);
		expect(runtime.entrypointDependencyGraph).toBe(config.runtime?.entrypointDependencyGraph);
	});
});
