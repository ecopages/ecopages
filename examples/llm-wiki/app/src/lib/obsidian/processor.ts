import { Processor } from '@ecopages/core/plugins/processor';
import type { EcoBuildPlugin, ProcessorWatchConfig, ProcessorWatchContext } from '@ecopages/core/plugins/processor';
import { join } from 'node:path';
import { writeWikiSearchIndex } from '@/lib/search/wiki';
import { ingestVault, resolveSourcesDir, resolveVaultDir } from './ingest';

/**
 * Mirrors `wiki/*.md` into `src/content/wiki` so it can be exposed as an
 * Ecopages content collection.
 *
 * @remarks
 * Watches the wiki and sources directories (configured via `WIKI_DIR` and
 * `SOURCES_DIR` env vars). The content processor watches the generated
 * content directory; this processor only synchronizes it and reloads browsers.
 */
export class ObsidianIngestProcessor extends Processor {
	plugins: EcoBuildPlugin[] = [];
	buildPlugins: EcoBuildPlugin[] = [];

	constructor() {
		const watch: ProcessorWatchConfig = {
			paths: [resolveVaultDir(process.cwd()), resolveSourcesDir(process.cwd())],
			extensions: ['.md'],
		};

		super({
			name: 'obsidian-ingest',
			description: 'Mirrors wiki/*.md into the wiki content collection and sources/*.md into public/sources/.',
			watch,
		});

		const handle = (ctx: ProcessorWatchContext) => this.handleVaultEvent(ctx);
		watch.onCreate = handle;
		watch.onChange = handle;
		watch.onDelete = handle;
	}

	private getAppRoot(): string {
		return this.context?.rootDir ?? this.context?.config.rootDir ?? process.cwd();
	}

	/**
	 * Constructor watch paths use `process.cwd()` before config exists. Rebind to
	 * the resolved app root so a launch from the monorepo root still watches
	 * `wiki/`, not `<cwd>/wiki`.
	 */
	private bindWatchPaths(): void {
		if (this.watchConfig) {
			this.watchConfig.paths = [resolveVaultDir(this.getAppRoot()), resolveSourcesDir(this.getAppRoot())];
		}
	}

	/**
	 * Runs before the content collection scan, so generated pages exist before
	 * configuration finalization rather than only after processor setup.
	 */
	override async prepareBuildContributions(): Promise<void> {
		this.bindWatchPaths();
		await ingestVault({ appRoot: this.getAppRoot() });
	}

	async setup(): Promise<void> {
		await ingestVault({ appRoot: this.getAppRoot() });
		await this.writeSearchIndex();
	}

	async process(): Promise<unknown> {
		await ingestVault({ appRoot: this.getAppRoot() });
		await this.writeSearchIndex();
		return undefined;
	}

	private async writeSearchIndex(): Promise<void> {
		const paths = this.context?.config.absolutePaths;
		if (!paths?.publicDir) {
			return;
		}
		const contentRoot = join(paths.srcDir, 'content/wiki');
		await writeWikiSearchIndex(paths.publicDir, { contentRoot });
		if (paths.distDir) {
			await writeWikiSearchIndex(paths.distDir, { contentRoot });
		}
	}

	private async handleVaultEvent(ctx: ProcessorWatchContext): Promise<void> {
		await ingestVault({ appRoot: this.getAppRoot() });
		await this.writeSearchIndex();
		ctx.bridge.reload();
	}
}

export const obsidianIngestPlugin = (): ObsidianIngestProcessor => new ObsidianIngestProcessor();
