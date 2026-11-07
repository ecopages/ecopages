import MagicString from 'magic-string';
import type { ModuleType, RolldownPlugin } from 'rolldown';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import {
	WORKER_CONSTRUCTOR_PATTERN,
	findWorkerUrls,
	formatClassicWorkerError,
	formatUnbundledWorkerWarning,
	formatWorkerUrlQueryError,
	isUnbundledWorkerUrl,
} from '../worker-urls.ts';

const NODE_MODULES_PATTERN = /\/node_modules\//;

const PARSER_LANGUAGES = ['js', 'jsx', 'ts', 'tsx'] as const;

function parserLanguage(moduleType: ModuleType): (typeof PARSER_LANGUAGES)[number] {
	return PARSER_LANGUAGES.find((language) => language === moduleType) ?? 'js';
}

/**
 * Builds each relative module Worker URL of a browser build as its own entry.
 *
 * @remarks
 * The worker is emitted as a chunk of the same build, so it shares chunks with the page code that imports the
 * same modules, and the `new URL(...)` expression becomes `import.meta.ROLLUP_FILE_URL_<ref>`, which Rolldown
 * replaces with the emitted file's URL, resolved against `import.meta.url`. The page chunk's hash then follows the worker's file name.
 * A Worker URL left as written is reported as a build warning, so a source path never ships silently.
 * A classic worker fails the build: worker output is ESM and may import shared chunks. Installed packages are left
 * as they are, so a package that starts a classic worker or handles a failed one itself still builds.
 */
export function createWorkerEntriesPlugin(): RolldownPlugin {
	return {
		name: 'ecopages:worker-entries',
		transform: {
			filter: { id: { exclude: NODE_MODULES_PATTERN }, code: WORKER_CONSTRUCTOR_PATTERN },
			async handler(code, id, meta) {
				const program = parseModuleSource(id, code, {
					sourceType: 'module',
					lang: parserLanguage(meta.moduleType),
				}).program;
				const urls = findWorkerUrls(program, code);
				let source: MagicString | undefined;
				for (const url of urls) {
					if (url.kind === 'classic') throw new Error(formatClassicWorkerError(url, id));
					if (url.kind === 'query') throw new Error(formatWorkerUrlQueryError(url, id));
					if (isUnbundledWorkerUrl(url)) {
						this.warn(formatUnbundledWorkerWarning(url, id));
						continue;
					}
					const resolved = await this.resolve(url.specifier, id);
					if (!resolved || resolved.external) {
						throw new Error(
							`Could not resolve the ${url.constructorName} URL ${JSON.stringify(url.specifier)} in ${id}.`,
						);
					}
					const referenceId = this.emitFile({ type: 'chunk', id: resolved.id });
					source ??= new MagicString(code);
					source.overwrite(
						url.expression.start,
						url.expression.end,
						`import.meta.ROLLUP_FILE_URL_${referenceId}`,
					);
				}
				if (!source) return null;
				return { code: source.toString(), map: source.generateMap({ hires: true }) };
			},
		},
	};
}
