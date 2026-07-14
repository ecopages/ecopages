import { statSync } from 'node:fs';
import { fileSystem } from '@ecopages/file-system';

export type StartupTracePhase =
	'config-ready' | 'setupAppRuntimePlugins' | 'route-registry' | 'server-listen' | 'first-request-ssr';

type PhaseRecord = {
	durationMs: number;
	wallMs: number;
};

const LOG_PREFIX = '[ecopages:startup-trace]';

function isStartupTraceEnabled(): boolean {
	return process.env.ECOPAGES_STARTUP_TRACE === 'true' || process.env.ECOPAGES_LOGGER_DEBUG === 'true';
}

function wallMsSinceProcessStart(): number {
	return Math.round(process.uptime() * 1000);
}

function writeTraceLine(message: string): void {
	process.stderr.write(`${LOG_PREFIX} ${message}\n`);
}

class StartupTrace {
	private readonly phaseStarts = new Map<StartupTracePhase, number>();
	private readonly phases = new Map<StartupTracePhase, PhaseRecord>();
	private firstRequestPending = true;
	private firstRequestPath: string | undefined;
	private firstRequestBundleCount = 0;
	private firstRequestClientBytes = 0;
	private summaryEmitted = false;

	isEnabled(): boolean {
		return isStartupTraceEnabled();
	}

	markPhaseStart(phase: StartupTracePhase): void {
		if (!isStartupTraceEnabled() || this.phases.has(phase)) {
			return;
		}

		this.phaseStarts.set(phase, performance.now());
	}

	markPhaseEnd(phase: StartupTracePhase): void {
		if (!isStartupTraceEnabled() || this.phases.has(phase)) {
			return;
		}

		const startedAt = this.phaseStarts.get(phase);
		if (startedAt === undefined) {
			return;
		}

		const durationMs = Math.round(performance.now() - startedAt);
		const record: PhaseRecord = {
			durationMs,
			wallMs: wallMsSinceProcessStart(),
		};
		this.phases.set(phase, record);
		writeTraceLine(`phase=${phase} durationMs=${durationMs} wallMs=${record.wallMs}`);
	}

	markConfigReady(): void {
		if (!isStartupTraceEnabled() || this.phases.has('config-ready')) {
			return;
		}

		const record: PhaseRecord = {
			durationMs: 0,
			wallMs: wallMsSinceProcessStart(),
		};
		this.phases.set('config-ready', record);
		writeTraceLine(`phase=config-ready wallMs=${record.wallMs}`);
	}

	markServerListening(): void {
		this.markPhaseEnd('server-listen');
	}

	beginServerListen(): void {
		this.markPhaseStart('server-listen');
	}

	recordBrowserBundle(outputs: Array<{ path: string }>): void {
		if (!isStartupTraceEnabled() || !this.firstRequestPending) {
			return;
		}

		this.firstRequestBundleCount += 1;

		for (const output of outputs) {
			try {
				if (fileSystem.exists(output.path)) {
					this.firstRequestClientBytes += statSync(output.path).size;
				}
			} catch {
				// ignore unreadable outputs
			}
		}
	}

	async traceFirstRequest<T>(request: Request, handler: () => Promise<T>): Promise<T> {
		if (!isStartupTraceEnabled() || !this.firstRequestPending) {
			return handler();
		}

		this.firstRequestPath = new URL(request.url).pathname;
		this.markPhaseStart('first-request-ssr');

		try {
			return await handler();
		} finally {
			this.markPhaseEnd('first-request-ssr');
			this.emitFirstRequestSummary();
			this.firstRequestPending = false;
		}
	}

	private emitFirstRequestSummary(): void {
		if (!isStartupTraceEnabled() || this.summaryEmitted) {
			return;
		}

		this.summaryEmitted = true;
		writeTraceLine(
			[
				'summary',
				`path=${this.firstRequestPath ?? 'unknown'}`,
				`bundleCount=${this.firstRequestBundleCount}`,
				`clientBundleBytes=${this.firstRequestClientBytes}`,
				`wallMs=${wallMsSinceProcessStart()}`,
			].join(' '),
		);
	}

	/** Resets mutable trace state for unit tests. */
	resetForTests(): void {
		this.phaseStarts.clear();
		this.phases.clear();
		this.firstRequestPending = true;
		this.firstRequestPath = undefined;
		this.firstRequestBundleCount = 0;
		this.firstRequestClientBytes = 0;
		this.summaryEmitted = false;
	}
}

export const startupTrace = new StartupTrace();
