import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { createInterface } from 'node:readline';

/**
 * Detects whether a thrown error indicates the requested port is already in
 * use.
 *
 * @remarks
 * Matches Node's `code: 'EADDRINUSE'` and Bun's surface, where the error
 * carries the same `code` plus a human-readable message such as
 * `"Failed to start server. Is port 3000 in use?"`. Older Bun builds that do
 * not set `.code` are covered by a fallback match on `syscall === 'listen'`
 * plus the message shape.
 */
export function isPortInUseError(error: unknown): boolean {
	if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) {
		return false;
	}

	const maybeErr = error as { code?: unknown; syscall?: unknown; message?: string };
	const code =
		typeof maybeErr.code === 'string' || typeof maybeErr.code === 'number' ? String(maybeErr.code) : undefined;
	const syscall = typeof maybeErr.syscall === 'string' ? maybeErr.syscall : undefined;
	const message = error instanceof Error ? error.message : String((maybeErr as { message?: string }).message ?? '');

	if (code === 'EADDRINUSE') {
		return true;
	}

	if (message.includes('EADDRINUSE')) {
		return true;
	}

	if (syscall === 'listen' && /is port \d+ in use\??/i.test(message)) {
		return true;
	}

	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Probes whether a TCP port is currently bindable from this process. Uses a
 * short-lived Node `net.Server` so both Node and Bun can run it via their
 * Node-compatible core.
 *
 * @remarks
 * A successful probe only guarantees the port was free at probe time; callers
 * must still handle EADDRINUSE when they actually bind, since release races
 * can flip the answer between probe and bind.
 */
export function isPortAvailable(port: number, hostname = '127.0.0.1'): Promise<boolean> {
	return new Promise((resolve) => {
		const tester: NetServer = createNetServer();

		tester.once('error', () => resolve(false));
		tester.once('listening', () => {
			tester.close(() => resolve(true));
		});

		tester.listen(port, hostname);
	});
}

/**
 * Default interactive prompt. Asks a yes/no question on stdin/stdout and
 * auto-approves (returns `true`) after `timeoutMs` with no input.
 *
 * @returns `true` when the user accepted (or timed out), `false` when they declined.
 */
export type PromptFunction = (message: string, timeoutMs: number) => Promise<boolean>;

function createDefaultPrompt(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): PromptFunction {
	return async (message: string, timeoutMs: number) => {
		stdout.write(`${message} `);

		return await new Promise<boolean>((resolve) => {
			const rl = createInterface({ input: stdin, output: undefined, terminal: false });
			let settled = false;

			const finish = (value: boolean) => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timer);
				rl.close();
				stdout.write('\n');
				resolve(value);
			};

			const timer = setTimeout(() => finish(true), timeoutMs);

			rl.once('line', (line) => {
				const answer = line.trim().toLowerCase();
				if (answer === '' || answer === 'y' || answer === 'yes') {
					finish(true);
				} else {
					finish(false);
				}
			});

			rl.once('close', () => finish(true));
		});
	};
}

/** Outcome of attempting to bind a single port. */
type BindOutcome =
	| { status: 'bound'; boundPort: number }
	| { status: 'port-in-use'; error: unknown }
	| { status: 'factory-refused' };

export interface PortManagerOptions {
	/**
	 * Bind factory. Should throw on EADDRINUSE (or return `null`/`undefined`
	 * when it declines without a port collision). Returning a non-null port
	 * marks the bind as successful.
	 */
	startOnPort: (port: number) => Promise<number | null | undefined>;
	/** Emits the "moved to port X" warning when the bound port differs from the preferred port. */
	warn?: (message: string) => void;
	/** Infers a free port to display in the prompt. Defaults to {@link isPortAvailable}. */
	probePort?: (port: number) => Promise<boolean>;
	/** Custom prompter. Defaults to a readline-based yes/no prompt on the process stdio. */
	prompt?: PromptFunction;
	/** Enables the prompt flow at all. Defaults to `process.stdin.isTTY && process.stdout.isTTY`. */
	interactive?: boolean;
	/** Auto-approve timeout (ms) for the prompt. Defaults to 10000. */
	autoApproveMs?: number;
	/** Maximum port offset to scan when falling back. Defaults to 20. */
	maxPortOffset?: number;
	/** Retry attempts for the same port before declaring it taken. Defaults to 2. */
	releaseRaceRetries?: number;
	/** Backoff between same-port retries. Defaults to 100 ms. */
	releaseRaceDelayMs?: number;
}

export interface BindPortOptions {
	/** Port the caller would prefer to bind. */
	preferredPort: number;
	/**
	 * Whether the caller permits moving to the next free port automatically when
	 * the preferred port is busy and no interactive prompt is available
	 * (non-TTY / CI). Explicit ports that fall back silently in CI would surprise
	 * operators, so this is honoured by the non-interactive path only.
	 */
	allowPortFallback: boolean;
}

const PREVIEW_PORT_RELEASE_RACE_RETRIES = 2;
const PREVIEW_PORT_FALLBACK_ATTEMPTS = 20;
const PREVIEW_PORT_RELEASE_RACE_DELAY_MS = 100;
const PREVIEW_PORT_AUTO_APPROVE_MS = 10_000;

/**
 * Owns preview-port assignment: probing, race-release retries, fallback, and
 * an optional interactive auto-approve prompt.
 *
 * @remarks
 * Single-process API. The manager does not cache ports across calls; each
 * `bind()` runs fresh from the preferred port.
 */
export class PortManager {
	private readonly startOnPort: (port: number) => Promise<number | null | undefined>;
	private readonly warn: ((message: string) => void) | undefined;
	private readonly probePort: (port: number) => Promise<boolean>;
	private readonly prompt: PromptFunction | undefined;
	private readonly interactive: boolean;
	private readonly autoApproveMs: number;
	private readonly maxPortOffset: number;
	private readonly releaseRaceRetries: number;
	private readonly releaseRaceDelayMs: number;

	constructor(options: PortManagerOptions) {
		this.startOnPort = options.startOnPort;
		this.warn = options.warn;
		this.probePort = options.probePort ?? isPortAvailable;
		this.maxPortOffset = options.maxPortOffset ?? PREVIEW_PORT_FALLBACK_ATTEMPTS - 1;
		this.releaseRaceRetries = options.releaseRaceRetries ?? PREVIEW_PORT_RELEASE_RACE_RETRIES;
		this.releaseRaceDelayMs = options.releaseRaceDelayMs ?? PREVIEW_PORT_RELEASE_RACE_DELAY_MS;
		this.autoApproveMs = options.autoApproveMs ?? PREVIEW_PORT_AUTO_APPROVE_MS;

		this.interactive =
			typeof options.interactive === 'boolean'
				? options.interactive
				: Boolean(typeof process !== 'undefined' && process.stdin?.isTTY && process.stdout?.isTTY);

		if (options.prompt) {
			this.prompt = options.prompt;
		} else if (this.interactive) {
			this.prompt = createDefaultPrompt(process.stdin as NodeJS.ReadStream, process.stdout as NodeJS.WriteStream);
		} else {
			this.prompt = undefined;
		}
	}

	/**
	 * Binds the preview server to the preferred port.
	 *
	 * @remarks
	 * When the preferred port is free, binds it directly — no prompt, no
	 * fallback. The interactive prompt only fires on a genuine EADDRINUSE
	 * collision (TTY runs), and auto-approves after
	 * {@link PortManagerOptions.autoApproveMs}. In non-interactive (CI) runs,
	 * the manager falls back silently only when
	 * {@link BindPortOptions.allowPortFallback} is true (the default-port
	 * path); pinned ports rethrow EADDRINUSE so Docker-style fixed-port
	 * deployments fail loudly instead of silently moving.
	 */
	public async bind(options: BindPortOptions): Promise<number | null> {
		const preferredPort = options.preferredPort;
		const firstAttempt = await this.tryPort(preferredPort);

		if (firstAttempt.status === 'bound') {
			return firstAttempt.boundPort;
		}

		if (firstAttempt.status === 'factory-refused') {
			return null;
		}

		// firstAttempt.status === 'port-in-use'
		await this.shouldFallback(preferredPort, options.allowPortFallback, firstAttempt.error);

		return await this.fallForward(preferredPort);
	}

	private async shouldFallback(preferredPort: number, allowPortFallback: boolean, error: unknown): Promise<void> {
		if (this.interactive && this.prompt) {
			const nextFree = await this.findNextFreePort(preferredPort);
			const nextFreeSuffix = typeof nextFree === 'number' ? ` (next free: ${nextFree})` : '';
			const autoApproveHint = `auto-yes in ${Math.round(this.autoApproveMs / 1000)}s`;
			const message = `[@ecopages/core] Port ${preferredPort} is already in use${nextFreeSuffix}. Bind there instead? [Y/n] (${autoApproveHint})`;
			const accepted = await this.prompt(message, this.autoApproveMs);

			if (!accepted) {
				throw error;
			}

			return;
		}

		if (!allowPortFallback) {
			throw error;
		}
	}

	private async fallForward(preferredPort: number): Promise<number | null> {
		for (let offset = 1; offset <= this.maxPortOffset; offset += 1) {
			const candidatePort = preferredPort + offset;
			const attempt = await this.tryPort(candidatePort);

			if (attempt.status === 'bound') {
				this.warn?.(
					`Port ${preferredPort} is in use; preview serving on port ${attempt.boundPort} instead. Pin the preview port with --port or ECOPAGES_PORT when a fixed binding is required.`,
				);
				return attempt.boundPort;
			}
		}

		return null;
	}

	/**
	 * Attempts to bind via {@link PortManagerOptions.startOnPort} on `port`,
	 * retrying EADDRINUSE collisions up to
	 * {@link PortManagerOptions.releaseRaceRetries} to ride through TIME_WAIT
	 * race release.
	 *
	 * @remarks
	 * Only EADDRINUSE is retryable. Any other error is rethrown synchronously
	 * rather than swallowed as a soft "port taken" result, so a misconfigured
	 * factory surfaces loudly instead of causing a silent fallback. A `null`
	 * return from the factory (no throw) is reported as `factory-refused`, not
	 * conflated with a real collision.
	 */
	private async tryPort(port: number): Promise<BindOutcome> {
		for (let attempt = 0; attempt < this.releaseRaceRetries; attempt += 1) {
			try {
				const bound = await this.startOnPort(port);
				if (bound) {
					return { status: 'bound', boundPort: bound };
				}

				return { status: 'factory-refused' };
			} catch (error) {
				if (!isPortInUseError(error)) {
					throw error;
				}

				if (attempt === this.releaseRaceRetries - 1) {
					return { status: 'port-in-use', error };
				}

				await sleep(this.releaseRaceDelayMs);
			}
		}

		return { status: 'factory-refused' };
	}

	private async findNextFreePort(startPort: number): Promise<number | null> {
		for (let offset = 1; offset <= this.maxPortOffset; offset += 1) {
			const candidate = startPort + offset;
			if (await this.probePort(candidate)) {
				return candidate;
			}
		}

		return null;
	}
}
