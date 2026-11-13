import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { FILE_ROLE_SCRIPT_EXTENSIONS } from '../../utils/file-roles.ts';

const SOURCE_EXTENSIONS = [...FILE_ROLE_SCRIPT_EXTENSIONS, '.html', '.mdx'];
const warnedScripts = new WeakMap<EcoPagesAppConfig, Set<string>>();

/**
 * Warns once per `.script.*` file under the source directory that no source file names.
 *
 * @remarks
 * A `.script.*` suffix only declares a browser module; a declaration still attaches it through
 * `dependencies.scripts`. A script nothing attaches never reaches a page, which is silent otherwise.
 * Development has no list of every declaration before each page renders, so a file counts as attached
 * when another source file quotes its name (`'./counter.script.ts'`, `"./counter.script"`), whether in
 * `dependencies.scripts`, an import or a `<script src>`. Development only; a build skips the check.
 */
export async function warnUnattachedScripts(appConfig: EcoPagesAppConfig): Promise<void> {
	const { srcDir } = appConfig.absolutePaths;
	if (!fileSystem.exists(srcDir)) return;

	const warned = warnedScripts.get(appConfig) ?? new Set<string>();
	warnedScripts.set(appConfig, warned);

	const sources = (
		await fileSystem.glob(
			SOURCE_EXTENSIONS.map((extension) => `**/*${extension}`),
			{ cwd: srcDir },
		)
	)
		.filter((file) => !file.split('/').includes('node_modules'))
		.map((file) => path.join(srcDir, file));
	const scripts = sources.filter((file) => /\.script\.[jt]sx?$/.test(file) && !warned.has(file));
	if (scripts.length === 0) return;

	const contents = await Promise.all(sources.map(async (file) => ({ file, text: await fileSystem.readFile(file) })));
	for (const script of scripts) {
		const name = path.basename(script).replace(/\.[jt]sx?$/, '');
		const reference = new RegExp(`['"\`](?:[^'"\`\\n]*/)?${name.replace(/\./g, '\\.')}(?:\\.[jt]sx?)?['"\`]`);
		if (contents.some(({ file, text }) => file !== script && reference.test(text))) continue;

		warned.add(script);
		appLogger.warn(
			`${script} is a browser script (.script.*) that no page or component attaches. List it in a declaration's dependencies.scripts, or rename it if it is not a browser script.`,
		);
	}
}
