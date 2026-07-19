import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import {
	removeStaleHmrEntrypointOutput,
	resolveHmrEntrypointOutputPaths,
	type ResolvedHmrEntrypoint,
} from '../../../hmr/hmr-entrypoint-output.ts';

/**
 * Runtime-specific hooks required to materialize a single HMR entrypoint.
 */
export interface HmrEntrypointRegistrationOptions {
	/**
	 * Emits the browser-consumable HMR artifact for an entrypoint.
	 */
	emit(entrypointPath: string, outputPath: string): Promise<void>;
	/**
	 * Creates the runtime-specific error raised when the emit hook completes without producing output.
	 */
	getMissingOutputError(entrypointPath: string, outputPath: string): Error;
}

export interface HmrEntrypointRegistrarOptions {
	/** Absolute source directory used to derive the emitted HMR path. */
	srcDir: string;
	/** Absolute distribution directory where HMR outputs are written. */
	distDir: string;
	/** Runtime-specific cleanup invoked when an entrypoint registration fails. */
	clearFailedRegistration?: (entrypointPath: string) => void;
}

/**
 * Coordinates the shared HMR entrypoint registration lifecycle for both Node and Bun managers.
 *
 * @remarks
 * The registrar owns in-flight deduplication and the registered entrypoint table.
 * A source path is committed only after emit succeeds and the expected output exists on disk.
 */
export class HmrEntrypointRegistrar {
	private readonly options: HmrEntrypointRegistrarOptions;
	private readonly inFlight = new Map<string, Promise<ResolvedHmrEntrypoint>>();
	private readonly registered = new Map<string, ResolvedHmrEntrypoint>();

	constructor(options: HmrEntrypointRegistrarOptions) {
		this.options = options;
	}

	getRegistered(): ReadonlyMap<string, ResolvedHmrEntrypoint> {
		return this.registered;
	}

	getWatchedFiles(): Map<string, string> {
		const watchedFiles = new Map<string, string>();
		for (const [sourcePath, entrypoint] of this.registered) {
			watchedFiles.set(sourcePath, entrypoint.outputUrl);
		}
		return watchedFiles;
	}

	clearRegistration(entrypointPath: string): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		this.registered.delete(normalizedEntrypoint);
		this.inFlight.delete(normalizedEntrypoint);
	}

	isEntrypointInFlight(entrypointPath: string): boolean {
		return this.inFlight.has(path.resolve(entrypointPath));
	}

	/**
	 * Registers an in-flight promise so concurrent {@link registerEntrypoint}
	 * callers coalesce on the same cold client-graph build.
	 */
	trackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): void {
		this.tryTrackInFlightEntrypoint(entrypointPath, promise);
	}

	/**
	 * Reserves the in-flight slot when it is still free.
	 *
	 * @returns `false` when another registration (for example on-demand SSR) already owns the slot.
	 */
	tryTrackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): boolean {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		if (this.inFlight.has(normalizedEntrypoint)) {
			return false;
		}

		this.inFlight.set(normalizedEntrypoint, promise);
		return true;
	}

	releaseInFlightEntrypoint(entrypointPath: string): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		if (this.inFlight.get(normalizedEntrypoint)) {
			this.inFlight.delete(normalizedEntrypoint);
		}
	}

	/**
	 * Tracks a dev-transform module URL without a Rolldown disk artifact.
	 */
	registerTransformModule(sourcePath: string, outputUrl: string): void {
		const normalized = path.resolve(sourcePath);
		this.registered.set(normalized, {
			sourcePath: normalized,
			outputPath: normalized,
			outputUrl,
		});
	}

	clearAll(): void {
		this.inFlight.clear();
		this.registered.clear();
	}

	/**
	 * Registers a single source entrypoint and returns its verified HMR artifact.
	 *
	 * Concurrent requests for the same normalized entrypoint share the same in-flight promise.
	 */
	async registerEntrypoint(
		entrypointPath: string,
		registrationOptions: HmrEntrypointRegistrationOptions,
	): Promise<ResolvedHmrEntrypoint> {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		const existing = this.registered.get(normalizedEntrypoint);
		if (existing && fileSystem.exists(existing.outputPath)) {
			return existing;
		}

		const existingRegistration = this.inFlight.get(normalizedEntrypoint);
		if (existingRegistration) {
			return await existingRegistration;
		}

		const registration = this.registerEntrypointInternal(normalizedEntrypoint, registrationOptions);
		this.inFlight.set(normalizedEntrypoint, registration);

		try {
			return await registration;
		} catch (error) {
			this.options.clearFailedRegistration?.(normalizedEntrypoint);
			this.registered.delete(normalizedEntrypoint);
			throw error;
		} finally {
			if (this.inFlight.get(normalizedEntrypoint) === registration) {
				this.inFlight.delete(normalizedEntrypoint);
			}
		}
	}

	private async registerEntrypointInternal(
		entrypointPath: string,
		registrationOptions: HmrEntrypointRegistrationOptions,
	): Promise<ResolvedHmrEntrypoint> {
		const previous = this.registered.get(entrypointPath);
		const { outputPath, outputUrl } = resolveHmrEntrypointOutputPaths(
			this.options.srcDir,
			this.options.distDir,
			entrypointPath,
		);

		removeStaleHmrEntrypointOutput(outputPath, 'HMR');

		try {
			await registrationOptions.emit(entrypointPath, outputPath);

			if (!fileSystem.exists(outputPath)) {
				throw registrationOptions.getMissingOutputError(entrypointPath, outputPath);
			}

			const resolved: ResolvedHmrEntrypoint = {
				sourcePath: entrypointPath,
				outputPath,
				outputUrl,
			};
			this.registered.set(entrypointPath, resolved);
			return resolved;
		} catch (error) {
			if (previous && fileSystem.exists(previous.outputPath)) {
				this.registered.set(entrypointPath, previous);
			}
			throw error;
		}
	}
}
