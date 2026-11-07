import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { applyStylesheetProcessors } from '../../assets/asset-processing-service/processors/stylesheet/stylesheet-processor-pipeline.ts';
import { writeSourceRelativeStylesheet } from '../../assets/asset-processing-service/processors/stylesheet/source-relative-stylesheet.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../config/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { AnyProcessor, StylesheetInvalidation } from '../../plugins/processor.ts';
import { findStylesheetProcessor, getStylesheetKinds, type StylesheetKinds } from '../../plugins/stylesheet-kinds.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { isPathInside } from '../../utils/path-containment.ts';

/** One watcher batch, by kind. Paths are absolute. */
export interface StylesheetChanges {
	created: readonly string[];
	changed: readonly string[];
	deleted: readonly string[];
}

/** The stylesheet Processor and the stylesheet kinds one task of the service works with. */
interface StylesheetScope {
	processor: AnyProcessor;
	kinds: StylesheetKinds;
}

/** The last good output of a stylesheet and its digest. */
interface StylesheetOutput {
	css: string;
	digest: string;
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
 * - writes each output at its source-relative href (only for a stylesheet in `srcDir`) and sends `css-update` only
 *   when the bytes changed.
 *
 * Only the Project Watcher and the dev transform server create it, so it never runs in production, which writes no
 * stylesheet outside the build.
 *
 * A stylesheet that fails keeps its last good output and sends `bridge.error`. The first success after a failure
 * always sends `css-update`, even with the same bytes, since the browser clears the error overlay only on a message
 * that is not an error. A stylesheet in the public directory is copied as written, so the service leaves it alone.
 */
export class DevelopmentStylesheetService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly outputs = new Map<string, StylesheetOutput>();
	private readonly failed = new Set<string>();
	private readonly dependencies = new Map<string, ReadonlySet<string>>();
	private readonly dependents = new Map<string, Set<string>>();
	private queue: Promise<unknown> = Promise.resolve();

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * The registered Processor that transforms stylesheets, with the app's stylesheet kinds, or `undefined` when none
	 * does.
	 *
	 * @remarks
	 * Looked up at the start of each task rather than once, since the service can exist before every Processor is
	 * registered on the config. A Processor without `transformStylesheet` takes no part in stylesheets, so it is never
	 * the one, whatever its capabilities.
	 */
	private resolveScope(): StylesheetScope | undefined {
		const processor = findStylesheetProcessor(
			[...this.appConfig.processors.values()].filter(
				(candidate) => typeof candidate.transformStylesheet === 'function',
			),
		);
		return processor && { processor, kinds: getStylesheetKinds(this.appConfig) };
	}

	/** Processes every stylesheet the Processor owns in `srcDir`, logging and skipping one that fails. */
	prewarm(): Promise<void> {
		return this.enqueue(async () => {
			const scope = this.resolveScope();
			if (!scope) return;
			const srcDir = this.appConfig.absolutePaths.srcDir;
			const patterns = scope.kinds.extensions.map((extension) => `**/*${extension}`);
			for (const relativePath of await fileSystem.glob(patterns, { cwd: srcDir })) {
				const file = path.join(srcDir, relativePath);
				if (this.owns(scope, file)) await this.rebuild(file);
			}
		});
	}

	/**
	 * Rebuilds the stylesheets one watcher batch affects and returns those whose output changed, or that recovered.
	 *
	 * @remarks
	 * A changed file rebuilds every stylesheet whose transform read it, except one that another of those stylesheets
	 * reads in turn: a transform reports nested imports too, so that outer stylesheet is rebuilt already. Two
	 * stylesheets that import each other are both rebuilt. A changed stylesheet that none read is rebuilt itself; a
	 * partial is not rebuilt alone, since it may only compile inside the stylesheets that read it. A created stylesheet
	 * also retries every stylesheet that failed, since one may have failed on the missing import the new file
	 * satisfies, and a failed transform reports no dependencies. The changed files that are not stylesheets go to the
	 * Processor's `invalidateStylesheets` hook, which names the stylesheets they make stale.
	 */
	applyChanges(changes: StylesheetChanges, bridge: IClientBridge): Promise<string[]> {
		return this.enqueue(async () => {
			const scope = this.resolveScope();
			if (!scope) return [];
			const resolve = (files: readonly string[]) => files.map((file) => path.resolve(file));
			const created = resolve(changes.created);
			const changed = resolve(changes.changed);
			const deleted = resolve(changes.deleted);
			for (const file of deleted) this.forget(file);

			const affected = this.collectAffected(scope, created, changed, deleted);
			for (const file of await this.invalidatedByContent(scope, [...created, ...changed, ...deleted], bridge)) {
				affected.add(file);
			}

			const restyled: string[] = [];
			for (const file of affected) {
				if (await this.rebuild(file, bridge)) restyled.push(file);
			}
			return restyled;
		});
	}

	/** The stylesheets a batch's stylesheet changes affect, before the invalidation hook adds its own. */
	private collectAffected(
		scope: StylesheetScope,
		created: readonly string[],
		changed: readonly string[],
		deleted: readonly string[],
	): Set<string> {
		const affected = new Set<string>();
		for (const file of [...created, ...changed, ...deleted]) {
			const readers = this.dependents.get(file) ?? new Set<string>();
			for (const reader of readers) {
				const coveredByAnotherReader = [...(this.dependents.get(reader) ?? [])].some((outer) =>
					readers.has(outer),
				);
				if (!coveredByAnotherReader) affected.add(reader);
			}
		}
		for (const file of [...created, ...changed]) {
			if (this.owns(scope, file) && !this.dependents.has(file)) affected.add(file);
		}
		if (created.some((file) => this.owns(scope, file))) {
			for (const file of this.failed) affected.add(file);
		}
		return affected;
	}

	/**
	 * A digest of the last good output of `file`, or `undefined` when the service has none.
	 *
	 * @remarks
	 * The dev transform server versions a stylesheet import with it, so the URL changes when an `@import` partial or
	 * the Processor's content changes the CSS, not only when the stylesheet's own bytes do.
	 */
	version(file: string): string | undefined {
		return this.outputs.get(path.resolve(file))?.digest;
	}

	/**
	 * The stylesheets the Processor's invalidation hook names for the files of a batch that are not stylesheets.
	 *
	 * @remarks
	 * A hook that throws is logged and shown, and invalidates nothing, so the rest of the batch still updates.
	 */
	private async invalidatedByContent(
		{ processor, kinds }: StylesheetScope,
		files: readonly string[],
		bridge: IClientBridge,
	): Promise<string[]> {
		const content = files.filter((file) => !kinds.isStylesheet(file));
		if (content.length === 0 || !processor.invalidateStylesheets) return [];
		let invalidated: StylesheetInvalidation;
		try {
			invalidated = await processor.invalidateStylesheets(content);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			appLogger.error(`Processor ${processor.name} failed to invalidate stylesheets: ${message}`);
			bridge.error(message);
			return [];
		}
		if (invalidated === 'all') return this.entries();
		return invalidated.map((file) => path.resolve(file)).filter((file) => this.owns({ processor, kinds }, file));
	}

	/** The stylesheets the service processed, or failed to, that no other stylesheet read. */
	private entries(): string[] {
		return [...new Set([...this.outputs.keys(), ...this.failed])].filter((file) => !this.dependents.has(file));
	}

	private owns({ processor, kinds }: StylesheetScope, file: string): boolean {
		return (
			processor.canProcessAsset('stylesheet', file) &&
			kinds.isStylesheet(file) &&
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
			if (!recovered && this.outputs.get(file)?.css === css) return false;
			const { srcDir, distDir } = this.appConfig.absolutePaths;
			writeSourceRelativeStylesheet({ srcDir, distDir }, file, css);
			this.outputs.set(file, { css, digest: contentHash(css) });
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

	private recordDependencies(file: string, dependencies: readonly string[]): void {
		for (const dependency of this.dependencies.get(file) ?? []) {
			const dependents = this.dependents.get(dependency);
			dependents?.delete(file);
			if (dependents?.size === 0) this.dependents.delete(dependency);
		}
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
