import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';

/**
 * Shared runtime state used while registering HMR-owned entrypoints.
 */
export interface HmrEntrypointRegistrarOptions {
	/** Absolute source directory used to derive the emitted HMR path. */
	srcDir: string;
	/** Absolute distribution directory where HMR outputs are written. */
	distDir: string;
	/** In-flight registrations keyed by normalized absolute entrypoint path. */
	entrypointRegistrations: Map<string, Promise<string>>;
	/** Stable entrypoint-to-output mapping retained once an entrypoint is registered. */
	watchedFiles: Map<string, string>;
	/** Runtime-specific cleanup invoked when an entrypoint registration fails. */
	clearFailedRegistration?: (entrypointPath: string) => void;
	/** Development-only guardrail for integrations that never finish producing output. */
	registrationTimeoutMs: number;
}

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

/**
 * Coordinates the shared HMR entrypoint registration lifecycle for both Node and Bun managers.
 *
 * The registrar owns the cross-runtime policy: normalize entrypoint identities, dedupe concurrent
 * registrations, derive the emitted `_hmr` output path, clear stale output before rebuilding, and
 * apply the development timeout that prevents unresolved registrations from hanging navigation.
 * Runtime-specific managers remain responsible for the actual emit step and any cleanup outside
 * this shared registration flow.
 */
export class HmrEntrypointRegistrar {
	constructor(private readonly options: HmrEntrypointRegistrarOptions) {}

	/**
	 * Registers a single source entrypoint and returns the browser URL for its emitted HMR module.
	 *
	 * Concurrent requests for the same normalized entrypoint share the same in-flight promise so the
	 * integration only builds once per registration cycle.
	 */
	async registerEntrypoint(
		entrypointPath: string,
		registrationOptions: HmrEntrypointRegistrationOptions,
	): Promise<string> {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		const existingRegistration = this.options.entrypointRegistrations.get(normalizedEntrypoint);
		if (existingRegistration) {
			return await this.awaitEntrypointRegistration(existingRegistration, normalizedEntrypoint);
		}

		const registration = this.registerEntrypointInternal(normalizedEntrypoint, registrationOptions);
		this.options.entrypointRegistrations.set(normalizedEntrypoint, registration);

		try {
			return await this.awaitEntrypointRegistration(registration, normalizedEntrypoint);
		} catch (error) {
			this.options.clearFailedRegistration?.(normalizedEntrypoint);
			throw error;
		} finally {
			this.options.entrypointRegistrations.delete(normalizedEntrypoint);
		}
	}

	private async registerEntrypointInternal(
		entrypointPath: string,
		registrationOptions: HmrEntrypointRegistrationOptions,
	): Promise<string> {
		if (this.options.watchedFiles.has(entrypointPath)) {
			return this.options.watchedFiles.get(entrypointPath)!;
		}

		const { outputPath, outputUrl } = this.getEntrypointOutput(entrypointPath);

		this.options.watchedFiles.set(entrypointPath, outputUrl);
		this.removeStaleEntrypointOutput(outputPath);

		await registrationOptions.emit(entrypointPath, outputPath);

		if (!fileSystem.exists(outputPath)) {
			throw registrationOptions.getMissingOutputError(entrypointPath, outputPath);
		}

		return outputUrl;
	}

	private async awaitEntrypointRegistration(registration: Promise<string>, entrypointPath: string): Promise<string> {
		if (process.env.NODE_ENV !== 'development') {
			return await registration;
		}

		return await Promise.race([
			registration,
			new Promise<string>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`[HMR] Timed out registering entrypoint: ${entrypointPath}`));
				}, this.options.registrationTimeoutMs);
			}),
		]);
	}

	private getEntrypointOutput(entrypointPath: string): { outputPath: string; outputUrl: string } {
		const relativePath = path.relative(this.options.srcDir, entrypointPath);
		const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
		const encodedPathJs = this.encodeDynamicSegments(relativePathJs);
		const urlPath = encodedPathJs.split(path.sep).join('/');

		return {
			outputUrl: `/${path.join(RESOLVED_ASSETS_DIR, '_hmr', urlPath)}`,
			outputPath: path.join(this.options.distDir, urlPath),
		};
	}

	private removeStaleEntrypointOutput(outputPath: string): void {
		if (!fileSystem.exists(outputPath)) {
			return;
		}

		try {
			fileSystem.remove(outputPath);
		} catch (error) {
			appLogger.warn(
				`[HMR] Failed to remove stale entrypoint output ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private encodeDynamicSegments(filepath: string): string {
		return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
	}
}
