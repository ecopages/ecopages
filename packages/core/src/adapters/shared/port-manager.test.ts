import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { isPortInUseError, isPortAvailable, PortManager } from './port-manager.ts';

/**
 * Bun's real EADDRINUSE shape, captured from a live probe against `bun.serve`
 * against an occupied port: `code: 'EADDRINUSE'` is an own enumerable
 * property alongside `syscall: 'listen'` and `errno: 0`, with the message
 * "Failed to start server. Is port <N> in use?".
 *
 * Node's `http.Server` emits the same `code` with a different message.
 */
function bunEaddrInUse(port: number): Error {
	const error = new Error(`Failed to start server. Is port ${port} in use?`);
	Object.assign(error, { code: 'EADDRINUSE', syscall: 'listen', errno: 0 });
	return error;
}

function nodeEaddrInUse(port: number): Error {
	const error = new Error(`listen EADDRINUSE: address already in use :::${port}`);
	Object.assign(error, { code: 'EADDRINUSE', syscall: 'listen', errno: -98 });
	return error;
}

function bunFallbackShapeWithoutCode(port: number): Error {
	const error = new Error(`Failed to start server. Is port ${port} in use?`);
	Object.assign(error, { syscall: 'listen', errno: 0 });
	return error;
}

describe('isPortInUseError', () => {
	it('matches Bun EADDRINUSE', () => {
		expect(isPortInUseError(bunEaddrInUse(3000))).toBe(true);
	});

	it('matches Node EADDRINUSE', () => {
		expect(isPortInUseError(nodeEaddrInUse(3000))).toBe(true);
	});

	it('matches Bun message shape even without code for older runtimes', () => {
		expect(isPortInUseError(bunFallbackShapeWithoutCode(3000))).toBe(true);
	});

	it('does not match unrelated errors', () => {
		const error = new Error('permission denied');
		Object.assign(error, { code: 'EACCES', syscall: 'open' });
		expect(isPortInUseError(error)).toBe(false);
	});

	it('handles string errors without crashing', () => {
		expect(isPortInUseError('something else')).toBe(false);
	});
});

describe('isPortAvailable', () => {
	it('uses a real socket probe', async () => {
		const holder = createNetServer();
		await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
		const occupiedPort = (holder.address() as { port: number }).port;

		try {
			expect(await isPortAvailable(occupiedPort, '127.0.0.1')).toBe(false);
		} finally {
			holder.close();
		}

		const freePort = 49152 + Math.floor(Math.random() * 1000);
		expect(await isPortAvailable(freePort, '127.0.0.1')).toBe(true);
	});
});

describe('PortManager', () => {
	it('binds the preferred port when it is free', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockImplementation(async (port) => port);

		const manager = new PortManager({ startOnPort });
		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: true });

		expect(bound).toBe(3000);
		assert.equal(startOnPort.mock.calls.length, 1);
	});

	it('throws after retries when fallback is disabled and non-interactive (explicit port, CI)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(bunEaddrInUse(3000));

		const manager = new PortManager({
			startOnPort,
			interactive: false,
			releaseRaceRetries: 2,
			releaseRaceDelayMs: 0,
		});

		await expect(manager.bind({ preferredPort: 3000, allowPortFallback: false })).rejects.toMatchObject({
			code: 'EADDRINUSE',
		});

		expect(startOnPort.mock.calls).toEqual([[3000], [3000]]);
	});

	it('prompts the user even when fallback is enabled (default port, interactive)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockImplementation(async (port) => {
			if (port === 3000) {
				throw bunEaddrInUse(3000);
			}

			return port;
		});

		const prompt = vi.fn<(message: string, timeoutMs: number) => Promise<boolean>>().mockResolvedValue(true);
		const probePort = vi.fn<(port: number) => Promise<boolean>>().mockResolvedValue(true);
		const warn = vi.fn();

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: true,
			probePort,
			warn,
			releaseRaceDelayMs: 0,
		});

		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: true });

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(prompt.mock.calls[0]?.[0]).toContain('Port 3000 is already in use');
		expect(prompt.mock.calls[0]?.[0]).toContain('next free: 3001');
		expect(prompt.mock.calls[0]?.[0]).toContain('auto-yes in');
		expect(bound).toBe(3001);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('Port 3000 is in use; preview serving on port 3001 instead.'),
		);
	});

	it('prompts the user when port is pinned (explicit port, interactive)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockImplementation(async (port) => {
			if (port === 3000) {
				throw bunEaddrInUse(3000);
			}

			return port;
		});

		const prompt = vi.fn<(message: string, timeoutMs: number) => Promise<boolean>>().mockResolvedValue(true);
		const probePort = vi.fn<(port: number) => Promise<boolean>>().mockResolvedValue(true);

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: true,
			probePort,
			releaseRaceDelayMs: 0,
		});

		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: false });

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(bound).toBe(3001);
	});

	it('rejects when the user declines the prompt (stays on preferred port)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(bunEaddrInUse(3000));

		const prompt = vi.fn().mockResolvedValue(false);

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: true,
			probePort: vi.fn().mockResolvedValue(true),
			releaseRaceDelayMs: 0,
		});

		await expect(manager.bind({ preferredPort: 3000, allowPortFallback: false })).rejects.toMatchObject({
			code: 'EADDRINUSE',
		});
	});

	it('declines also fail when the default port was used', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(bunEaddrInUse(3000));

		const prompt = vi.fn().mockResolvedValue(false);

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: true,
			probePort: vi.fn().mockResolvedValue(true),
			releaseRaceDelayMs: 0,
		});

		await expect(manager.bind({ preferredPort: 3000, allowPortFallback: true })).rejects.toMatchObject({
			code: 'EADDRINUSE',
		});
	});

	it('silently falls back when non-interactive and fallback is allowed (default port, CI)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockImplementation(async (port) => {
			if (port === 3000) {
				throw bunEaddrInUse(3000);
			}

			return port;
		});

		const prompt = vi.fn().mockResolvedValue(true);
		const warn = vi.fn();

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: false,
			warn,
			releaseRaceDelayMs: 0,
		});

		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: true });

		expect(prompt).not.toHaveBeenCalled();
		expect(bound).toBe(3001);
		expect(warn).toHaveBeenCalled();
	});

	it('does not prompt or fall back when non-interactive and port is pinned (explicit port, CI)', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(bunEaddrInUse(3000));

		const prompt = vi.fn().mockResolvedValue(true);

		const manager = new PortManager({
			startOnPort,
			prompt,
			interactive: false,
			releaseRaceDelayMs: 0,
		});

		await expect(manager.bind({ preferredPort: 3000, allowPortFallback: false })).rejects.toMatchObject({
			code: 'EADDRINUSE',
		});
		expect(prompt).not.toHaveBeenCalled();
	});

	it('returns null without prompting or scanning when the factory declines without a collision', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockResolvedValue(null);

		const prompt = vi.fn();
		const warn = vi.fn();

		const manager = new PortManager({
			startOnPort,
			interactive: true,
			prompt,
			warn,
			releaseRaceDelayMs: 0,
		});

		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: true });

		expect(bound).toBeNull();
		assert.equal(startOnPort.mock.calls.length, 1);
		expect(prompt).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});

	it('returns null when every fallback port is taken', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(bunEaddrInUse(0));

		const manager = new PortManager({
			startOnPort,
			interactive: false,
			maxPortOffset: 3,
			releaseRaceRetries: 1,
			releaseRaceDelayMs: 0,
		});

		const bound = await manager.bind({ preferredPort: 3000, allowPortFallback: true });
		expect(bound).toBeNull();
	});

	it('rethrows non-EADDRINUSE errors immediately', async () => {
		const startOnPort = vi.fn<(port: number) => Promise<number | null>>().mockRejectedValue(new Error('boom'));

		const manager = new PortManager({
			startOnPort,
			interactive: false,
			releaseRaceRetries: 2,
			releaseRaceDelayMs: 0,
		});

		await expect(manager.bind({ preferredPort: 3000, allowPortFallback: true })).rejects.toThrow('boom');

		expect(startOnPort.mock.calls).toEqual([[3000]]);
	});
});
