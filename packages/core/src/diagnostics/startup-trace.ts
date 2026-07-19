import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { availableParallelism } from 'node:os';
import { fileSystem } from '@ecopages/file-system';

export type StartupTracePhase =
	| 'config-ready'
	| 'setupAppRuntimePlugins'
	| 'route-registry'
	| 'server-listen'
	| 'dev-cold-client-graph'
	| 'first-byte'
	| 'first-page-browser-graph'
	| 'first-request-ssr'
	| 'client-transfer'
	| 'client-hydration';

type PhaseRecord = {
	durationMs: number;
	wallMs: number;
};

type PhaseNesting = {
	outerStart: number;
	depth: number;
};

export type StartupTraceReport = {
	generatedAt: string;
	runtime: string;
	platform: string;
	phases: Partial<Record<StartupTracePhase, PhaseRecord>>;
	firstRequest?: {
		path: string;
		bundleCount: number;
		clientBundleBytes: number;
		graphBuildCount: number;
		wallMs: number;
	};
	client?: {
		requestCount: number;
		transferredBytes: number;
		hmrConnected: boolean;
		hydrationReadyMs: number | null;
	};
};

const LOG_PREFIX = '[ecopages:startup-trace]';

function isStartupTraceEnabled(): boolean {
	return process.env.ECOPAGES_STARTUP_TRACE === 'true' || process.env.ECOPAGES_LOGGER_DEBUG === 'true';
}

function wallMsSinceProcessStart(): number {
	return Math.round(process.uptime() * 1000);
}

function resolveTraceBuildParallelism(): string {
	const fromEnv = process.env.ECOPAGES_DEV_BUILD_PARALLELISM ?? process.env.ECOPAGES_DEV_HMR_PARALLELISM;
	if (fromEnv) {
		return fromEnv;
	}

	return String(Math.max(1, availableParallelism()));
}

function writeTraceLine(message: string): void {
	process.stderr.write(`${LOG_PREFIX} ${message}\n`);
}

function resolveStartupTraceJsonPath(): string | undefined {
	const configured = process.env.ECOPAGES_STARTUP_TRACE_JSON?.trim();
	return configured && configured.length > 0 ? configured : undefined;
}

class StartupTrace {
	private readonly phaseNesting = new Map<StartupTracePhase, PhaseNesting>();
	private readonly phases = new Map<StartupTracePhase, PhaseRecord>();
	private firstRequestPending = true;
	private firstRequestPath: string | undefined;
	private firstRequestBundleCount = 0;
	private firstRequestClientBytes = 0;
	private firstRequestGraphBuildCount = 0;
	private summaryEmitted = false;
	private firstPageBrowserGraphEmitted = false;
	private clientRequestCount = 0;
	private clientTransferredBytes = 0;
	private hmrConnected = false;
	private hydrationReadyMs: number | null = null;

	isEnabled(): boolean {
		return isStartupTraceEnabled();
	}

	markPhaseStart(phase: StartupTracePhase): void {
		if (!isStartupTraceEnabled() || this.phases.has(phase)) {
			return;
		}

		const nesting = this.phaseNesting.get(phase);
		if (!nesting) {
			this.phaseNesting.set(phase, { outerStart: performance.now(), depth: 1 });
			return;
		}

		nesting.depth += 1;
	}

	markPhaseEnd(phase: StartupTracePhase): void {
		if (!isStartupTraceEnabled() || this.phases.has(phase)) {
			return;
		}

		const nesting = this.phaseNesting.get(phase);
		if (!nesting) {
			return;
		}

		nesting.depth -= 1;
		if (nesting.depth > 0) {
			return;
		}

		const durationMs = Math.round(performance.now() - nesting.outerStart);
		const record: PhaseRecord = {
			durationMs,
			wallMs: wallMsSinceProcessStart(),
		};
		this.phases.set(phase, record);
		this.phaseNesting.delete(phase);
		writeTraceLine(`phase=${phase} durationMs=${durationMs} wallMs=${record.wallMs}`);
		this.writeJsonReport();
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
		writeTraceLine(`phase=config-ready wallMs=${record.wallMs} buildParallelism=${resolveTraceBuildParallelism()}`);
		this.writeJsonReport();
	}

	markServerListening(): void {
		this.markPhaseEnd('server-listen');
	}

	beginServerListen(): void {
		this.markPhaseStart('server-listen');
	}

	markFirstByte(): void {
		if (!isStartupTraceEnabled() || this.phases.has('first-byte')) {
			return;
		}

		this.markPhaseEnd('first-byte');
	}

	beginFirstByte(): void {
		this.markPhaseStart('first-byte');
	}

	markFirstPageBrowserGraphReady(graphBuildCount?: number): void {
		if (!isStartupTraceEnabled() || this.firstPageBrowserGraphEmitted) {
			return;
		}

		if (typeof graphBuildCount === 'number') {
			this.firstRequestGraphBuildCount = graphBuildCount;
		}

		this.firstPageBrowserGraphEmitted = true;
		this.markPhaseEnd('first-page-browser-graph');
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

	recordClientTransfer(requestCount: number, transferredBytes: number): void {
		if (!isStartupTraceEnabled()) {
			return;
		}

		this.clientRequestCount = requestCount;
		this.clientTransferredBytes = transferredBytes;
		this.markPhaseEnd('client-transfer');
	}

	beginClientTransfer(): void {
		this.markPhaseStart('client-transfer');
	}

	recordClientHydration(durationMs: number): void {
		if (!isStartupTraceEnabled()) {
			return;
		}

		this.hydrationReadyMs = durationMs;
		this.markPhaseEnd('client-hydration');
	}

	beginClientHydration(): void {
		this.markPhaseStart('client-hydration');
	}

	recordHmrConnected(): void {
		if (!isStartupTraceEnabled()) {
			return;
		}

		this.hmrConnected = true;
	}

	async traceFirstRequest<T>(request: Request, handler: () => Promise<T>): Promise<T> {
		if (!isStartupTraceEnabled() || !this.firstRequestPending) {
			return handler();
		}

		this.firstRequestPath = new URL(request.url).pathname;
		this.markPhaseStart('first-page-browser-graph');
		this.markPhaseStart('first-request-ssr');

		try {
			return await handler();
		} finally {
			this.markPhaseEnd('first-request-ssr');
			this.emitFirstRequestSummary();
			this.firstRequestPending = false;
			this.writeJsonReport();
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
				`graphBuildCount=${this.firstRequestGraphBuildCount}`,
				`wallMs=${wallMsSinceProcessStart()}`,
			].join(' '),
		);
	}

	private writeJsonReport(): void {
		const outputPath = resolveStartupTraceJsonPath();
		if (!outputPath) {
			return;
		}

		const report = this.createReport();
		mkdirSync(path.dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
	}

	createReport(): StartupTraceReport {
		const phases: Partial<Record<StartupTracePhase, PhaseRecord>> = {};
		for (const [phase, record] of this.phases) {
			phases[phase] = record;
		}

		return {
			generatedAt: new Date().toISOString(),
			runtime: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`,
			platform: process.platform,
			phases,
			firstRequest: this.firstRequestPath
				? {
						path: this.firstRequestPath,
						bundleCount: this.firstRequestBundleCount,
						clientBundleBytes: this.firstRequestClientBytes,
						graphBuildCount: this.firstRequestGraphBuildCount,
						wallMs: wallMsSinceProcessStart(),
					}
				: undefined,
			client:
				this.clientRequestCount > 0 || this.hydrationReadyMs !== null
					? {
							requestCount: this.clientRequestCount,
							transferredBytes: this.clientTransferredBytes,
							hmrConnected: this.hmrConnected,
							hydrationReadyMs: this.hydrationReadyMs,
						}
					: undefined,
		};
	}

	/** Resets mutable trace state for unit tests. */
	resetForTests(): void {
		this.phaseNesting.clear();
		this.phases.clear();
		this.firstRequestPending = true;
		this.firstRequestPath = undefined;
		this.firstRequestBundleCount = 0;
		this.firstRequestClientBytes = 0;
		this.firstRequestGraphBuildCount = 0;
		this.summaryEmitted = false;
		this.firstPageBrowserGraphEmitted = false;
		this.clientRequestCount = 0;
		this.clientTransferredBytes = 0;
		this.hmrConnected = false;
		this.hydrationReadyMs = null;
	}

	/**
	 * Resets only the first-request bundle counters.
	 *
	 * @remarks
	 * Used by tests that need to re-measure first-request browser bundle work
	 * without clearing earlier startup phase records.
	 */
	resetFirstRequestCounters(): void {
		this.firstRequestBundleCount = 0;
		this.firstRequestClientBytes = 0;
		this.firstRequestGraphBuildCount = 0;
	}
}

export const startupTrace = new StartupTrace();
