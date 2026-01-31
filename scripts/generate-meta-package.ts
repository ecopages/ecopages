import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[ecopages:npm]');

const META_PACKAGE_DIR = join(process.cwd(), 'npm/ecopages');

/**
 * Minimal interface for a package.json file.
 */
interface PackageJson {
	name: string;
	version: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	exports?: Record<string, any>;
}

/**
 * Scans for packages by looking for jsr.json files in the packages directory.
 * A package with a jsr.json is a publishable library package.
 *
 * @returns An array of PackageJson objects representing public library packages.
 */
function scanPackages() {
	const packages: PackageJson[] = [];
	const jsrFiles = new Bun.Glob('packages/**/jsr.json').scanSync({ cwd: process.cwd() });

	for (const jsrPath of jsrFiles) {
		const packageJsonPath = jsrPath.replace('jsr.json', 'package.json');
		const fullPath = join(process.cwd(), packageJsonPath);

		if (existsSync(fullPath)) {
			const pkg = JSON.parse(readFileSync(fullPath, 'utf-8'));
			if (pkg.name && pkg.name.startsWith('@ecopages/') && pkg.name !== '@ecopages/ecopages') {
				packages.push(pkg);
			}
		}
	}

	return packages;
}

/**
 * Orchestrates the generation of the ecopages meta-package.
 *
 * It clears previous generated files, calculates combined exports and dependencies,
 * and creates the necessary directory structure and re-export files.
 */
async function generate() {
	logger.info('Generating ecopages meta-package...');
	const packages = scanPackages();
	const rootPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
	const version = rootPkg.version;

	const metaPkgJson: any = {
		name: 'ecopages',
		version,
		description: 'Universal entry point for Ecopages',
		type: 'module',
		license: 'MIT',
		author: 'Ecopages Team',
		repository: {
			type: 'git',
			url: 'git+https://github.com/ecopages/ecopages.git',
			directory: 'npm/ecopages',
		},
		homepage: 'https://github.com/ecopages/ecopages#readme',
		bugs: {
			url: 'https://github.com/ecopages/ecopages/issues',
		},
		keywords: ['ecopages', 'bun', 'web-framework', 'ssr', 'static-site-generator', 'react', 'kitajs', 'lit', 'mdx'],
		main: './index.js',
		types: './index.d.ts',
		bin: {
			ecopages: 'bin/cli.js',
		},
		exports: {
			'.': {
				import: './index.js',
				types: './index.d.ts',
			},
		},
		dependencies: {
			tiged: '^2.12.7',
			'@ecopages/logger': '^0.2.2',
		},
		devDependencies: {},
		peerDependencies: {
			'bun-types': 'latest',
			typescript: '^5',
		},
	};

	/**
	 * Prepare output directory: Clean up ONLY generated artifacts, preserving source files.
	 */
	if (!existsSync(META_PACKAGE_DIR)) {
		mkdirSync(META_PACKAGE_DIR, { recursive: true });
	}

	/**
	 * List of files that are "source" and should NOT be deleted.
	 */
	const PRESERVED_FILES = new Set(['package.json', 'tsconfig.json', 'README.md', 'bin', '.gitignore']);

	const metaDirEntries = new Bun.Glob('*').scanSync({ cwd: META_PACKAGE_DIR, onlyFiles: false });
	for (const entry of metaDirEntries) {
		if (PRESERVED_FILES.has(entry)) continue;

		const fullPath = join(META_PACKAGE_DIR, entry);
		rmSync(fullPath, { recursive: true, force: true });
	}

	for (const pkg of packages) {
		if (!pkg.name.startsWith('@ecopages/')) continue;

		const shortName = pkg.name.replace('@ecopages/', '');
		/**
		 * Map the dependency to the JSR-to-NPM compatibility layer versioned specifically.
		 */
		const jsrDependency = `npm:@jsr/ecopages__${shortName}@${version}`;
		metaPkgJson.devDependencies[pkg.name] = jsrDependency;

		const pkgExportBase = `./${shortName}`;

		if (pkg.exports) {
			for (const [subPath] of Object.entries(pkg.exports)) {
				const metaSubPath = subPath === '.' ? pkgExportBase : `${pkgExportBase}${subPath.slice(1)}`;

				/**
				 * Add to package.json exports.
				 */
				metaPkgJson.exports[metaSubPath] = {
					import: `${metaSubPath}/index.js`,
					types: `${metaSubPath}/index.d.ts`,
				};

				/**
				 * Create directory and re-export file.
				 */
				const subDir = join(META_PACKAGE_DIR, metaSubPath);
				mkdirSync(subDir, { recursive: true });

				const exportFrom = pkg.name + (subPath === '.' ? '' : subPath.slice(1));
				writeFileSync(join(subDir, 'index.js'), `export * from "${exportFrom}";\n`);
				writeFileSync(join(subDir, 'index.d.ts'), `export * from "${exportFrom}";\n`);
			}
		} else {
			/**
			 * Fallback if no exports are defined in original package.json.
			 */
			metaPkgJson.exports[pkgExportBase] = {
				import: `${pkgExportBase}/index.js`,
				types: `${pkgExportBase}/index.d.ts`,
			};
			const subDir = join(META_PACKAGE_DIR, shortName);
			mkdirSync(subDir, { recursive: true });
			writeFileSync(join(subDir, 'index.js'), `export * from "${pkg.name}";\n`);
			writeFileSync(join(subDir, 'index.d.ts'), `export * from "${pkg.name}";\n`);
		}
	}

	/**
	 * Write the root index entry point for the meta-package.
	 */
	writeFileSync(join(META_PACKAGE_DIR, 'index.js'), `export const version = "${version}";\n`);
	writeFileSync(join(META_PACKAGE_DIR, 'index.d.ts'), `export declare const version: string;\n`);

	/**
	 * Collect all generated directory names for the files field and .gitignore.
	 */
	const generatedDirs = new Set<string>();
	for (const exportPath of Object.keys(metaPkgJson.exports)) {
		if (exportPath === '.') continue;
		const topLevelDir = exportPath.split('/')[1];
		if (topLevelDir) generatedDirs.add(topLevelDir);
	}

	/**
	 * Add files field to ensure generated directories are included in NPM publish.
	 */
	metaPkgJson.files = [
		'index.js',
		'index.d.ts',
		'bin/',
		'README.md',
		...Array.from(generatedDirs).map((dir) => `${dir}/`),
	];

	/**
	 * Update .gitignore to exclude generated directories.
	 */
	const gitignorePath = join(META_PACKAGE_DIR, '.gitignore');
	const gitignoreHeader = '# Auto-generated directories (do not edit below this line)\n';

	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, '');
	}

	let gitignoreContent = readFileSync(gitignorePath, 'utf-8');

	const headerIndex = gitignoreContent.indexOf(gitignoreHeader);
	if (headerIndex !== -1) {
		gitignoreContent = gitignoreContent.slice(0, headerIndex);
	}

	gitignoreContent += gitignoreHeader;
	for (const dir of generatedDirs) {
		gitignoreContent += `${dir}/\n`;
	}
	gitignoreContent += 'index.js\n';
	gitignoreContent += 'index.d.ts\n';

	writeFileSync(gitignorePath, gitignoreContent);

	/**
	 * Save the final generated package.json for the ecopages meta-package.
	 */
	writeFileSync(join(META_PACKAGE_DIR, 'package.json'), JSON.stringify(metaPkgJson, null, 2));

	logger.info('Meta-package generated');
}

generate().catch(console.error);
