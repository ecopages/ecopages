import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { applyStylesheetProcessors } from '../../assets/asset-processing-service/processors/stylesheet/stylesheet-processor-pipeline.ts';
import { writeSourceRelativeStylesheet } from '../../assets/asset-processing-service/processors/stylesheet/source-relative-stylesheet.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../config/internal-types.ts';
import { isProductionRuntime } from '../../env.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { AnyProcessor } from '../../plugins/processor.ts';
import { findStylesheetProcessor, getStylesheetKinds } from '../../plugins/stylesheet-kinds.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { isPathInside } from '../../utils/path-containment.ts';

/** One watcher batch, by kind. Paths are absolute. */
export interface StylesheetChanges {
	created: readonly string[];
	changed: readonly string[];
	deleted: readonly string[];
}

/**
 * Keeps the app's stylesheets processed while `ecopages dev` runs.
 *
 * @remarks
 * Core owns this lifecycle for whichever stylesheet Processor the app registers; the Processor only transforms. The
 * service:
 * - prewarms every stylesheet the Processor owns in `srcDir`, so the first edit has an output to compare with;
 * - keeps each stylesheet's last good output, and the reverse map from each file a transform read to the stylesheets
 *   that read it, taken from the transform's own `dependencies`;
 * - runs watcher batches one at a time, in order;
 * - writes each output at its source-relative href (only for a stylesheet in `srcDir`; production writes nothing) and
 *   sends `css-update` only when the bytes changed.
 *
 * A stylesheet that fails keeps its last good output and sends `bridge.error`. The first success after a failure
 * always sends `css-update`, even with the same bytes, since the browser clears the error overlay only on a message
 * that is not an error. A stylesheet in the public directory is copied as written, so the service leaves it alone.
 */
export class DevelopmentStylesheetService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly outputs = new Map<string, string>();
	private readonly failed = new Set<string>();
	private readonly dependencies = new Map<string, ReadonlySet<string>>();
	private readonly dependents = new Map<string, Set<string>>();
	private queue: Promise<unknown> = Promise.resolve();

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * The registered Processor that transforms stylesheets, looked up on each use.
	 *
	 * @remarks
	 * A Processor without `transformStylesheet` takes no part in stylesheets, so it is never the one, whatever its
	 * capabilities.
	 */
	private get processor(): AnyProcessor | undefined {
		return findStylesheetProcessor(
			[...this.appConfig.processors.values()].filter(
				(processor) => typeof processor.transformStylesheet === 'function',
			),
		);
	}

	/** Processes every stylesheet the Processor owns in `srcDir`, logging and skipping one that fails. */
	prewarm(): Promise<void> {
		return this.enqueue(async () => {
			if (!this.processor?.transformStylesheet) return;
			const srcDir = this.appConfig.absolutePaths.srcDir;
			const patterns = getStylesheetKinds(this.appConfig).extensions.map((extension) => `**/*${extension}`);
			for (const relativePath of await fileSystem.glob(patterns, { cwd: srcDir })) {
				const file = path.join(srcDir, relativePath);
				if (this.owns(file)) await this.rebuild(file);
			}
		});
	}

	/**
	 * Rebuilds the stylesheets one watcher batch affects and returns those whose output changed, or that recovered.
	 *
	 * @remarks
	 * A changed file rebuilds every stylesheet whose transform read it. A changed stylesheet that none read is
	 * rebuilt itself; one that others read is a partial and is not rebuilt alone, since it may only compile inside
	 * them.
	 */
	applyChanges(changes: StylesheetChanges, bridge: IClientBridge): Promise<string[]> {
		return this.enqueue(async () => {
			if (!this.processor?.transformStylesheet) return [];
			const resolve = (files: readonly string[]) => files.map((file) => path.resolve(file));
			const created = resolve(changes.created);
			const changed = resolve(changes.changed);
			const deleted = resolve(changes.deleted);
			for (const file of deleted) this.forget(file);

			const affected = new Set<string>();
			for (const file of [...created, ...changed, ...deleted]) {
				for (const dependent of this.dependents.get(file) ?? []) affected.add(dependent);
			}
			for (const file of [...created, ...changed]) {
				if (this.owns(file) && !this.dependents.get(file)?.size) affected.add(file);
			}
			if ([...created, ...changed, ...deleted].some((file) => this.isWatchedContent(file))) {
				for (const entry of this.entries()) affected.add(entry);
			}

			const restyled: string[] = [];
			for (const file of affected) {
				if (await this.rebuild(file, bridge)) restyled.push(file);
			}
			return restyled;
		});
	}

	/**
	 * A digest of the last good output of `file`, or `undefined` when the service has none.
	 *
	 * @remarks
	 * The dev transform server versions a stylesheet import with it, so the URL changes when an `@import` partial or
	 * the Processor's content changes the CSS, not only when the stylesheet's own bytes do.
	 */
	version(file: string): string | undefined {
		const css = this.outputs.get(path.resolve(file));
		return css === undefined ? undefined : contentHash(css);
	}

	/**
	 * Whether `file` is content the Processor watches, such as a template Tailwind scans for class names.
	 *
	 * @remarks
	 * A change to one rebuilds every entry stylesheet, after the Processor's own watch handler ran.
	 */
	private isWatchedContent(file: string): boolean {
		const extensions = this.processor?.getWatchConfig()?.extensions ?? [];
		return (
			!getStylesheetKinds(this.appConfig).isStylesheet(file) &&
			extensions.some((extension) => file.endsWith(extension))
		);
	}

	/** The stylesheets the service processed, or failed to, that no other stylesheet read. */
	private entries(): string[] {
		return [...new Set([...this.outputs.keys(), ...this.failed])].filter(
			(file) => !this.dependents.get(file)?.size,
		);
	}

	private owns(file: string): boolean {
		return (
			this.processor?.canProcessAsset('stylesheet', file) === true &&
			getStylesheetKinds(this.appConfig).isStylesheet(file) &&
			!isPathInside(file, this.appConfig.absolutePaths.publicDir)
		);
	}

	/** Processes `file` and returns whether its output changed or recovered; with no `bridge`, nothing is sent. */
	private async rebuild(file: string, bridge?: IClientBridge): Promise<boolean> {
		if (!fileSystem.exists(file)) return false;
		try {
			const { css, dependencies } = await applyStylesheetProcessors(
				this.appConfig,
				await fileSystem.readFile(file),
				file,
			);
			this.recordDependencies(file, dependencies);
			const recovered = this.failed.delete(file);
			if (!recovered && this.outputs.get(file) === css) return false;
			this.persist(file, css);
			this.outputs.set(file, css);
			bridge?.cssUpdate(file);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.failed.add(file);
			appLogger.error(`Failed to process stylesheet ${file}: ${message}`);
			bridge?.error(message);
			return false;
		}
	}

	private persist(file: string, css: string): void {
		if (isProductionRuntime()) return;
		const { srcDir, distDir } = this.appConfig.absolutePaths;
		writeSourceRelativeStylesheet({ srcDir, distDir }, file, css);
	}

	private recordDependencies(file: string, dependencies: readonly string[]): void {
		for (const dependency of this.dependencies.get(file) ?? []) this.dependents.get(dependency)?.delete(file);
		this.dependencies.set(file, new Set(dependencies));
		for (const dependency of dependencies) {
			const dependents = this.dependents.get(dependency) ?? new Set<string>();
			dependents.add(file);
			this.dependents.set(dependency, dependents);
		}
	}

	/** Drops a deleted stylesheet's output and the files it read; the stylesheets that read it stay mapped to it. */
	private forget(file: string): void {
		this.outputs.delete(file);
		this.failed.delete(file);
		this.recordDependencies(file, []);
		this.dependencies.delete(file);
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => undefined);
		return run;
	}
}

/** Returns the one lazily created development stylesheet service of a finalized app. */
export function getDevelopmentStylesheetService(appConfig: EcoPagesAppConfig): DevelopmentStylesheetService {
	const runtime = requireAppRuntime(appConfig);
	runtime.developmentStylesheets ??= new DevelopmentStylesheetService(appConfig);
	return runtime.developmentStylesheets;
}
