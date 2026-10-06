/**
 * Fail before a fixture web server starts when one of its ports already has a listener.
 *
 * Usage:
 *   node e2e/scripts/playwright/assert-ports-free.mjs 43111 [4007 ...] && <server command>
 *
 * @remarks
 * `playwright.config.ts` prefixes every fixture `webServer` command with this script.
 * Those entries wait for a stdout line instead of a `url`/`port`, so Playwright skips
 * its own "already used" check, and a Bun server binds a busy port instead of failing.
 * Without this check, a server left over from an interrupted run answers the tests.
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function acceptsConnections(port, host) {
	return new Promise((resolve) => {
		const socket = net.connect(port, host);
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});
}

/**
 * Whether anything accepts TCP connections on `port` over IPv4 or IPv6 loopback,
 * which is where the tests' `http://localhost:<port>` requests go.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function isPortInUse(port) {
	const results = await Promise.all([acceptsConnections(port, '127.0.0.1'), acceptsConnections(port, '::1')]);
	return results.some(Boolean);
}

/**
 * PIDs listening on `port`, or an empty list when `lsof` is missing or finds none.
 *
 * @param {number} port
 * @returns {string[]}
 */
function findListenerPids(port) {
	try {
		const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return output.split('\n').filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * @param {number[]} ports
 * @returns {Promise<void>}
 */
export async function assertPortsFree(ports) {
	for (const port of ports) {
		if (!(await isPortInUse(port))) {
			continue;
		}

		const pids = findListenerPids(port);
		const owner = pids.length > 0 ? ` by PID ${pids.join(', ')}` : '';
		throw new Error(
			`Port ${port} is already in use${owner}. A server from an earlier e2e run may still be running; stop it and run the tests again.`,
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const ports = process.argv.slice(2).map(Number);
	if (ports.length === 0 || ports.some((port) => !Number.isInteger(port) || port <= 0)) {
		console.error('assert-ports-free: pass one or more port numbers');
		process.exit(1);
	}

	assertPortsFree(ports).catch((error) => {
		console.error(`[e2e] ${error.message}`);
		process.exit(1);
	});
}
