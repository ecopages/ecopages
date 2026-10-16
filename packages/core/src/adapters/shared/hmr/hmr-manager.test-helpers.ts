import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../config/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { ClientBridgeEvent, IClientBridge } from '../../../types/public-types.ts';
import { HmrManager } from './hmr-manager.ts';

/**
 * Creates a directory under `os.tmpdir()` that is removed when the test finishes.
 */
export function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	onTestFinished(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});
	return root;
}

/**
 * Writes a source file, creating its directories, and returns its path.
 */
export function writeSourceFile(rootDir: string, relativePath: string, source: string): string {
	const filePath = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, source, 'utf8');
	return filePath;
}

/**
 * Starts a Node HMR manager over `config` with a bridge that records what it broadcasts.
 *
 * @remarks
 * `subscriberCount` is what the bridge reports as connected browsers. The manager stops when the test finishes.
 */
export function startHmrManager(
	config: EcoPagesAppConfig,
	subscriberCount = 0,
): { manager: HmrManager; broadcasts: ClientBridgeEvent[] } {
	const broadcasts: ClientBridgeEvent[] = [];
	const bridge: IClientBridge = {
		subscriberCount,
		broadcast: (event) => {
			broadcasts.push(event);
		},
		reload: () => {},
		cssUpdate: () => {},
		update: () => {},
		error: () => {},
	};
	const manager = new HmrManager({ appConfig: config, bridge });
	onTestFinished(() => manager.stop());
	return { manager, broadcasts };
}

/**
 * Starts a Node HMR manager over a default app config rooted at `rootDir`.
 */
export async function startHmrManagerAt(rootDir: string, subscriberCount = 0) {
	return startHmrManager(await finalizeEcoPagesConfig({ rootDir }), subscriberCount);
}
