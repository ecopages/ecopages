import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type PackageJson = {
	name?: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
};

type TemplateManifest = {
	templates: Array<{
		id: string;
		displayName: string;
		description: string;
		category: string;
		order: number;
		default?: boolean;
		source: string;
		packageDirectory: string;
		integrations: string[];
	}>;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const templatesRoot = path.join(repoRoot, 'templates');
const manifestPath = path.join(repoRoot, 'packages/ecopages/templates.json');
const latestCompatibleExternalRanges: Record<string, string> = {
	'@ecopages/jsx': '^0.3.0-rc.5',
	'@ecopages/radiant': '^0.3.0-rc.5',
	'@ecopages/radiant-ui': '^0.1.0-rc.11',
	'@ecopages/signals': '^0.3.0-rc.5',
};

function readJson<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function collectPackageJsonPaths(root: string): string[] {
	const paths: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist') continue;
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			paths.push(...collectPackageJsonPaths(entryPath));
		} else if (entry.name === 'package.json') {
			paths.push(entryPath);
		}
	}
	return paths;
}

const manifest = readJson<TemplateManifest>(manifestPath);
const templateDirectories = readdirSync(templatesRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
const manifestIds = manifest.templates.map((template) => template.id).sort();

if (new Set(manifest.templates.map((template) => template.order)).size !== manifest.templates.length) {
	throw new Error('Template manifest order values must be unique.');
}

if (manifest.templates.filter((template) => template.default).length !== 1) {
	throw new Error('Template manifest must declare exactly one default template.');
}

if (JSON.stringify(templateDirectories) !== JSON.stringify(manifestIds)) {
	throw new Error(
		`Template manifest mismatch. Directories: ${templateDirectories.join(', ')}; manifest: ${manifestIds.join(', ')}.`,
	);
}

const workspacePackageNames = new Set(
	collectPackageJsonPaths(path.join(repoRoot, 'packages'))
		.map((filePath) => readJson<PackageJson>(filePath))
		.filter((manifestEntry) => Boolean(manifestEntry.name) && !manifestEntry.private)
		.map((manifestEntry) => manifestEntry.name!),
);
workspacePackageNames.add('ecopages');

for (const template of manifest.templates) {
	for (const field of ['id', 'displayName', 'description', 'category', 'source', 'packageDirectory']) {
		if (!template[field as keyof typeof template]) throw new Error(`Template ${template.id} is missing ${field}.`);
	}
	if (template.integrations.length === 0) throw new Error(`Template ${template.id} must list an integration.`);
	const templateRoot = path.join(templatesRoot, template.source);
	const packagePath = path.join(templateRoot, template.packageDirectory, 'package.json');
	if (!statSync(templateRoot).isDirectory()) throw new Error(`Missing template directory: ${template.source}`);
	const packageJson = readJson<PackageJson>(packagePath);
	const expectedPackageName = `@ecopages/template-${template.id}`;
	if (packageJson.name !== expectedPackageName) {
		throw new Error(
			`${template.id}: package name must be ${expectedPackageName} (found ${packageJson.name ?? 'missing'}).`,
		);
	}

	const tsconfigPath = path.join(templateRoot, template.packageDirectory, 'tsconfig.json');
	if (statSync(tsconfigPath).isFile()) {
		const tsconfig = readJson<{ compilerOptions?: { types?: unknown } }>(tsconfigPath);
		if (tsconfig.compilerOptions?.types) {
			throw new Error(`${template.id}: tsconfig compilerOptions.types opts out of generated @types packages.`);
		}
	}

	for (const block of [
		packageJson.dependencies,
		packageJson.devDependencies,
		packageJson.peerDependencies,
		packageJson.optionalDependencies,
	]) {
		for (const [dependencyName, version] of Object.entries(block ?? {})) {
			const latestCompatibleRange = latestCompatibleExternalRanges[dependencyName];
			if (latestCompatibleRange && version !== latestCompatibleRange) {
				throw new Error(
					`${template.id}: ${dependencyName} must use the latest compatible range ${latestCompatibleRange} (found ${version}).`,
				);
			}
			if (workspacePackageNames.has(dependencyName) && version !== 'workspace:*') {
				throw new Error(`${template.id}: ${dependencyName} must use workspace:* (found ${version}).`);
			}
			if (version.startsWith('workspace:') && !workspacePackageNames.has(dependencyName)) {
				throw new Error(`${template.id}: unknown workspace package ${dependencyName}.`);
			}
			if (version === 'latest' || version === '*' || version === 'workspace:^' || version === 'workspace:~') {
				throw new Error(`${template.id}: unsupported dependency range ${dependencyName}@${version}.`);
			}
			if (dependencyName.startsWith('@ecopages/') && /-(?:alpha|beta)\./u.test(version)) {
				throw new Error(`${template.id}: stale Ecopages prerelease ${dependencyName}@${version}.`);
			}
		}
	}
}

console.log(`Validated ${manifest.templates.length} official templates.`);
