import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { templateBuildOutputs } from './template-build-outputs.ts';

type TemplateManifest = {
	templates: Array<{ id: string; source: string; packageDirectory: string; buildOutputs?: unknown }>;
};

const repoRoot = path.resolve(import.meta.dirname, '..');

/** Templates that need more than a build and an output check. */
const extraCommands: Record<string, string[][]> = {
	electrobun: [
		['pnpm', 'test'],
		['pnpm', 'test:browser'],
	],
};

function run(command: string[], cwd: string): void {
	execFileSync(command[0]!, command.slice(1), { cwd, stdio: 'inherit' });
}

/**
 * Builds every official template in turn and checks the files its build must emit.
 *
 * @remarks
 * The expected files come from each manifest entry's `buildOutputs` (see `template-build-outputs.ts`), so a
 * template can require pages beyond `dist/client/index.html`. Pass template ids to check a subset.
 */
function main(): void {
	const manifest = JSON.parse(
		readFileSync(path.join(repoRoot, 'packages/ecopages/templates.json'), 'utf8'),
	) as TemplateManifest;
	const wanted = process.argv.slice(2);
	const templates = manifest.templates.filter((template) => wanted.length === 0 || wanted.includes(template.id));
	const failures: string[] = [];

	for (const template of templates) {
		const packageDir = path.join(repoRoot, 'templates', template.source, template.packageDirectory);
		console.log(`\n== ${template.id}`);
		run(['pnpm', 'run', 'build'], packageDir);
		const missing = templateBuildOutputs(template).filter((output) => !existsSync(path.join(packageDir, output)));
		for (const output of missing) failures.push(`${template.id}: ${output} is missing after the build`);
		for (const command of extraCommands[template.id] ?? []) run(command, packageDir);
	}

	if (failures.length > 0) {
		console.error(`\n${failures.join('\n')}`);
		process.exit(1);
	}
	console.log(`\nBuilt ${templates.length} templates; every expected output exists.`);
}

main();
