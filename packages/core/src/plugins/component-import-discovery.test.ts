import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import {
	attributeComponentIdentity,
	attributeMdxComponentIdentity,
	createEcoComponentMetaPlugin,
} from './eco-component-meta-plugin.ts';
import { hasDiscoveryRecord, isReachedByDiscovery } from './component-import-discovery.ts';
import { createStylesheetKinds, type StylesheetKinds } from './stylesheet-kinds.ts';
import { Processor } from './processor.ts';
import { getPluginTransform } from '../__fixtures__/build/transform-plugin.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';

const roots: string[] = [];
const DISCOVERED_COMPONENT = /components: \(\) => \[\w/;
function fixture() {
	const root = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-discovery-')));
	roots.push(root);
	writeFileSync(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }),
	);
	writeFileSync(
		path.join(root, 'child.ts'),
		`import { eco } from '@ecopages/core';
export const Child = eco.component({ render: () => '' });
const Other = eco.component({ render: () => '' });
export { Other as Renamed }; export default Other;
export function utility() { return 1; }`,
	);
	writeFileSync(path.join(root, 'style.css'), 'body { color: red }');
	return {
		root,
		transform: (imports: string, body = `export default eco.page({ render: () => '' });`) =>
			attributeComponentIdentity(
				`${imports}\nimport { eco } from '@ecopages/core';\n${body}`,
				path.join(root, 'page.ts'),
				{ integration: 'lit', projectRoot: root },
			).code,
	};
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('component import discovery', () => {
	it('discovers direct named, default and aliased exports in import order', () => {
		const { transform } = fixture();
		const result = transform(`import Default, { Child as Named, Renamed, utility, type Props } from '@/child';`);
		expect(result).toContain('components: () => [Default, Named, Renamed]');
		expect(result).not.toContain('components: () => [Default, Named, Renamed, utility]');
	});
	it('extracts relative and aliased CSS regardless of position and is idempotent', () => {
		const { root, transform } = fixture();
		const stylePath = 'style.css';
		const result = transform(`import './style.css';\nimport '@/style.css';`);
		expect(result).not.toContain(`import './style.css'`);
		expect(result).not.toContain(`import '@/style.css'`);
		expect(result).toContain(`stylesheets: ${JSON.stringify([stylePath])}`);
		expect(result).toContain('import { eco, bindComponentIdentity }');
		expect(
			attributeComponentIdentity(result, path.join(root, 'page.ts'), { integration: 'lit', projectRoot: root })
				.code,
		).toBe(result);
	});
	it('keeps side-effect CSS when every Eco factory argument already has an identity', () => {
		const { transform } = fixture();
		const result = transform(
			`import './style.css';\nimport { bindComponentIdentity } from '@ecopages/core';`,
			`export default eco.page(bindComponentIdentity({ id: 'page', file: '/page.ts', integration: 'lit' }, {}));`,
		);

		expect(result).toContain(`import './style.css';`);
		expect(result).toContain('eco.page(bindComponentIdentity(');
		expect(result).not.toContain('stylesheets:');
	});
	it('shares imports among multiple declarations without reading them eagerly', () => {
		const { transform } = fixture();
		const result = transform(
			`import { Child } from './child';`,
			`export const A = eco.component({ render: () => '' }); export const B = eco.html({ render: () => '' });`,
		);
		expect(result.match(/components: \(\) => \[Child\]/g)).toHaveLength(2);
	});
	it('leaves type, dynamic, namespace, package and ordinary helper imports alone', () => {
		const { transform } = fixture();
		const result = transform(
			`import type { Child } from './missing'; import * as children from './child'; import { utility } from './child'; import { Remote } from 'remote-package'; const later = () => import('./child');`,
		);
		expect(result).not.toMatch(DISCOVERED_COMPONENT);
	});
	it('does not discover a component re-exported through export *', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export * from './child';`);
		expect(transform(`import { Child } from './index';`)).not.toMatch(DISCOVERED_COMPONENT);
	});
	it('records the imported factory module as a watch file', () => {
		const { transform } = fixture();
		const childPath = 'child.ts';
		expect(transform(`import { Child } from './child';`)).toContain(`watchFiles: ${JSON.stringify([childPath])}`);
	});
	it('discovers named barrel re-exports of the imported binding only', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { Child, Renamed as Alias } from './child';`);
		expect(transform(`import { Child, Alias } from './index';`)).toContain('components: () => [Child, Alias]');
		expect(transform(`import { Child } from './index';`)).toContain('components: () => [Child]');
		expect(transform(`import { Child } from './index';`)).not.toContain('Alias');
		const barrel = transform(`import { Child } from './index';`);
		expect(barrel).toContain('"index.ts"');
		expect(barrel).toContain('"child.ts"');
	});
	it('follows nested named barrel re-exports', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'ui.ts'), `export { Child as Button } from './child';`);
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './ui';`);
		expect(transform(`import { Button } from './index';`)).toContain('components: () => [Button]');
	});
	it('discovers two named aliases that converge on the same component', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { Child as First, Child as Second } from './child';`);
		expect(transform(`import { First, Second } from './index';`)).toContain('components: () => [First, Second]');
	});
	it('does not hang or discover a circular named re-export chain', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'a.ts'), `export { Button } from './b';`);
		writeFileSync(path.join(root, 'b.ts'), `export { Button } from './a';`);
		expect(transform(`import { Button } from './a';`)).not.toMatch(DISCOVERED_COMPONENT);
	});
	it('discovers default-to-named barrel re-exports', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { default as Button } from './child';`);
		expect(transform(`import { Button } from './index';`)).toContain('components: () => [Button]');
	});
	it('re-reads a barrel retarget without editing the importing page', () => {
		const { root, transform } = fixture();
		writeFileSync(
			path.join(root, 'button-a.ts'),
			`import { eco } from '@ecopages/core';
export const Button = eco.component({ render: () => '' });`,
		);
		writeFileSync(path.join(root, 'button-b.ts'), `export const Button = () => '';`);
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-a';`);
		const imports = `import { Button } from './index';`;
		expect(transform(imports)).toContain('components: () => [Button]');
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-b';`);
		expect(transform(imports)).not.toMatch(DISCOVERED_COMPONENT);
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-a';`);
		expect(transform(imports)).toContain('components: () => [Button]');
	});
	it('leaves attributed and bound CSS imports alone', () => {
		const { transform } = fixture();
		const result = transform(`import './style.css' with { type: 'text' }; import styles from './style.css';`);
		expect(result).not.toContain('stylesheets: ["');
		expect(result).toContain(`import styles from './style.css'`);
	});
	describe('CSS Modules', () => {
		class ScopingProcessor extends Processor {
			async setup(): Promise<void> {}
		}
		const scoping = createStylesheetKinds([
			new ScopingProcessor({
				name: 'scoping',
				capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
			}),
		]);
		const moduleFixture = () => {
			const context = fixture();
			writeFileSync(path.join(context.root, 'style.module.css'), '.primary { color: red }');
			const attribute = (source: string, name = 'page.ts', delivered?: string[]) =>
				attributeComponentIdentity(source, path.join(context.root, name), {
					integration: 'lit',
					projectRoot: context.root,
					stylesheets: scoping,
					onStrippedStylesheet: (specifier) => delivered?.push(specifier),
				}).code;
			const page = (imports: string) =>
				attribute(
					`${imports}\nimport { eco } from '@ecopages/core';\nexport default eco.page({ render: () => '' });`,
				);
			return { ...context, attribute, page };
		};

		it('fails with the file, the import and the package to install when no Processor scopes CSS Modules', () => {
			const { transform } = fixture();
			expect(() => transform(`import './style.module.css';`)).toThrow(
				/page\.ts: "\.\/style\.module\.css" is a CSS Module\..*@ecopages\/lightningcss-processor/u,
			);
			expect(() => transform(`import styles from './style.module.css';`)).toThrow('"./style.module.css"');
		});
		it('keeps the binding import and delivers the scoped CSS as a stylesheet of the declaration', () => {
			const { page } = moduleFixture();
			const result = page(`import styles from './style.module.css';\nimport './style.css';`);
			expect(result).toContain(`import styles from './style.module.css'`);
			expect(result).not.toContain(`import './style.css'`);
			expect(result).toContain(`stylesheets: ${JSON.stringify(['style.module.css', 'style.css'])}`);
		});
		it('delivers and strips a side-effect CSS Module import', () => {
			const { page } = moduleFixture();
			const result = page(`import './style.module.css';`);
			expect(result).not.toContain(`import './style.module.css'`);
			expect(result).toContain(`stylesheets: ${JSON.stringify(['style.module.css'])}`);
		});
		it('delivers a CSS Module of an aliased import', () => {
			const { page } = moduleFixture();
			expect(page(`import styles from '@/style.module.css';`)).toContain(
				`stylesheets: ${JSON.stringify(['style.module.css'])}`,
			);
		});
		it('leaves an attributed CSS Module import alone', () => {
			const { page } = moduleFixture();
			const result = page(`import styles from './style.module.css' with { type: 'text' };`);
			expect(result).not.toContain('stylesheets: ["');
			expect(result).toContain('with { type');
		});
		it('keeps the CSS Module import of a plain module and reports only the side-effect import as stripped', () => {
			const { root, attribute } = moduleFixture();
			const delivered: string[] = [];
			const code = attribute(
				`import styles from './style.module.css';\nimport './style.css';\nexport const Card = () => styles.primary;`,
				'card.ts',
				delivered,
			);
			expect(code).toContain(`import styles from './style.module.css'`);
			expect(code).not.toContain(`import './style.css'`);
			expect(delivered).toEqual(['./style.css']);
			expect(root).toBeTruthy();
		});
		it('hands the CSS Module of a plain module to the nearest declaration', () => {
			const { root, page } = moduleFixture();
			writeFileSync(
				path.join(root, 'card.ts'),
				`import styles from './style.module.css';\nexport const Card = () => styles.primary;`,
			);
			const result = page(`import { Card } from './card';\nconsole.log(Card);`);
			expect(result).toContain(`plainModuleStylesheets: ${JSON.stringify(['style.module.css'])}`);
		});
		it('delivers a CSS Module from a package for any import form, keeping the binding import', () => {
			const { root, page, attribute } = moduleFixture();
			const dist = path.join(root, 'node_modules', 'some-lib', 'dist');
			mkdirSync(dist, { recursive: true });
			writeFileSync(path.join(root, 'node_modules', 'some-lib', 'package.json'), '{"name":"some-lib"}');
			writeFileSync(path.join(dist, 'x.module.css'), '.x {}');
			const entry = '|some-lib/dist/x.module.css';

			const bound = page(`import styles from 'some-lib/dist/x.module.css';`);
			expect(bound).toContain(`import styles from 'some-lib/dist/x.module.css'`);
			expect(bound).toContain(`stylesheets: ${JSON.stringify([entry])}`);
			expect(bound).toContain(`packageStylesheets: ${JSON.stringify([entry])}`);

			const sideEffect = page(`import 'some-lib/dist/x.module.css';`);
			expect(sideEffect).not.toContain(`import 'some-lib/dist/x.module.css'`);
			expect(sideEffect).toContain(`packageStylesheets: ${JSON.stringify([entry])}`);

			const plain = attribute(
				`import styles from 'some-lib/dist/x.module.css';\nexport const x = styles.x;`,
				'x.ts',
			);
			expect(plain).toContain(`import styles from 'some-lib/dist/x.module.css'`);
		});
		it('delivers a CSS Module a package exports under another name, for a binding import too', () => {
			const { root, page, attribute } = moduleFixture();
			const packageDir = path.join(root, 'node_modules', 'some-lib');
			mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
			writeFileSync(
				path.join(packageDir, 'package.json'),
				JSON.stringify({
					name: 'some-lib',
					exports: { './module.css': './dist/x.module.css', './plain.css': './dist/plain.css' },
				}),
			);
			writeFileSync(path.join(packageDir, 'dist', 'x.module.css'), '.x {}');
			writeFileSync(path.join(packageDir, 'dist', 'plain.css'), '.plain {}');

			const bound = page(`import styles from 'some-lib/module.css';`);
			expect(bound).toContain(`import styles from 'some-lib/module.css'`);
			expect(bound).toContain(`packageStylesheets: ${JSON.stringify(['|some-lib/dist/x.module.css'])}`);
			const plain = attribute(`import css from 'some-lib/plain.css';\nexport const x = css;`, 'x.ts');
			expect(plain).toContain(`import css from 'some-lib/plain.css'`);
		});
		describe('a CSS Module a package module imports itself', () => {
			const installKit = (root: string, extra: Record<string, string> = {}) => {
				const packageDir = path.join(root, 'node_modules', 'ui-kit');
				mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
				writeFileSync(
					path.join(packageDir, 'package.json'),
					JSON.stringify({ name: 'ui-kit', exports: { './button': './dist/button.js' } }),
				);
				const files: Record<string, string> = {
					'dist/button.js': `import styles from './button.module.css';\nexport const Button = () => styles.kit;`,
					'dist/button.module.css': '.kit {}',
					'dist/other.js': 'export const other = 1;',
					...extra,
				};
				for (const [name, contents] of Object.entries(files)) {
					writeFileSync(path.join(packageDir, name), contents);
				}
			};

			it('delivers it as a package stylesheet of the declaration that imports the package module', () => {
				const { root, page } = moduleFixture();
				installKit(root);

				const result = page(`import { Button } from 'ui-kit/button';\nconsole.log(Button);`);

				const entry = 'node_modules/ui-kit/dist|ui-kit/dist/button.module.css';
				expect(result).toContain(`import { Button } from 'ui-kit/button'`);
				expect(result).toContain(`plainModuleStylesheets: ${JSON.stringify([entry])}`);
				expect(result).toContain(`packageStylesheets: ${JSON.stringify([entry])}`);
				expect(isReachedByDiscovery(root, path.join(root, 'node_modules/ui-kit/dist/button.js'))).toBe(true);
			});
			it('counts a declaration of a linked package as seen by discovery, with its own CSS Module delivered', () => {
				const { root } = moduleFixture();
				const outside = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-linked-'))));
				roots.push(outside);
				writeFileSync(path.join(outside, 'package.json'), '{"name":"linked-kit"}');
				writeFileSync(path.join(outside, 'button.module.css'), '.kit {}');
				const file = path.join(outside, 'button.tsx');
				const code = attributeComponentIdentity(
					`import { eco } from '@ecopages/core';\nimport styles from './button.module.css';\nexport const Button = eco.component({ render: () => styles.kit });`,
					file,
					{ integration: 'lit', projectRoot: root, stylesheets: scoping },
				).code;

				expect(code).toContain('linked-kit/button.module.css');
				expect(hasDiscoveryRecord(root, file)).toBe(true);
			});
			it('follows the package module through the modules of its own package', () => {
				const { root, page } = moduleFixture();
				installKit(root, {
					'dist/button.js': `import { other } from './other.js';\nexport const Button = () => other;`,
					'dist/other.js': `import styles from './button.module.css';\nexport const other = styles.kit;`,
				});

				expect(page(`import { Button } from 'ui-kit/button';\nconsole.log(Button);`)).toContain(
					'ui-kit/dist/button.module.css',
				);
			});
			it('leaves the other imports of a package alone, and the side-effect CSS of a package module as it was', () => {
				const { root, page } = moduleFixture();
				installKit(root, { 'dist/button.js': `import './plain.css';\nexport const Button = () => 1;` });
				writeFileSync(path.join(root, 'node_modules/ui-kit/dist/plain.css'), '.plain {}');

				const result = page(
					`import { Button } from 'ui-kit/button';\nimport { eco as e } from '@ecopages/core';`,
				);

				expect(result).not.toContain('plain.css');
				expect(result).not.toContain('button.module.css');
			});
			it('fails with the file, the import and the package to install when no Processor scopes CSS Modules', () => {
				const { root, transform } = fixture();
				installKit(root);

				expect(() => transform(`import { Button } from 'ui-kit/button';`)).toThrow(
					/button\.js: "\.\/button\.module\.css" is a CSS Module\..*@ecopages\/lightningcss-processor/u,
				);
			});
		});
		it('fails with the file, the import and the package to install on a package CSS Module no Processor scopes', () => {
			const { transform } = fixture();
			expect(() => transform(`import styles from 'some-lib/dist/x.module.css';`)).toThrow(
				/page\.ts: "some-lib\/dist\/x\.module\.css" is a CSS Module\..*@ecopages\/lightningcss-processor/u,
			);
		});
		it('fails on a CSS Module of a specifier no Page could receive', () => {
			const { page } = moduleFixture();
			expect(() => page(`import styles from '#styles/card.module.css';`)).toThrow(
				'neither a relative, aliased nor package stylesheet',
			);
		});
	});
	describe('stylesheet kinds', () => {
		class SassProcessor extends Processor {
			async setup(): Promise<void> {}
		}
		const sass = new SassProcessor({
			name: 'sass',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.scss'] }],
		});
		const run = (stylesheets?: StylesheetKinds, imports = `import './card.scss';`) => {
			const { root } = fixture();
			writeFileSync(path.join(root, 'card.scss'), '.card { color: red }');
			writeFileSync(path.join(root, 'card.module.scss'), '.card { color: red }');
			return () =>
				attributeComponentIdentity(
					`${imports}\nimport { eco } from '@ecopages/core';\nexport default eco.page({ render: () => '' });`,
					path.join(root, 'page.ts'),
					{ integration: 'lit', projectRoot: root, stylesheets },
				).code;
		};
		it('delivers and strips an import of an extension the stylesheet Processor declares', () => {
			const result = run(createStylesheetKinds([sass]))();
			expect(result).not.toContain(`import './card.scss'`);
			expect(result).toContain(`stylesheets: ${JSON.stringify(['card.scss'])}`);
		});
		it('leaves the import alone when no Processor declares the extension', () => {
			for (const kinds of [undefined, createStylesheetKinds([])]) {
				const result = run(kinds)();
				expect(result).toContain(`import './card.scss'`);
				expect(result).not.toContain('stylesheets: ["');
			}
		});
		it('fails on a CSS Module of a declared extension', () => {
			expect(run(createStylesheetKinds([sass]), `import './card.module.scss';`)).toThrow(
				'"./card.module.scss" is a CSS Module',
			);
		});
		it('delivers a declared extension imported from an MDX document, and ignores it when none is declared', () => {
			const { root } = fixture();
			writeFileSync(path.join(root, 'card.scss'), '.card { color: red }');
			const mdxJs = [
				`import './card.scss';`,
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				'export default function MDXContent() { return _jsx("p", {}); }',
			].join('\n');
			const attribute = (stylesheets?: StylesheetKinds) =>
				attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root, undefined, stylesheets)
					.code;
			const delivered = attribute(createStylesheetKinds([sass]));
			expect(delivered).not.toContain(`import './card.scss'`);
			expect(delivered).toContain(`stylesheets: ${JSON.stringify(['card.scss'])}`);
			for (const kinds of [undefined, createStylesheetKinds([])]) {
				const ignored = attribute(kinds);
				expect(ignored).toContain(`import './card.scss'`);
				expect(ignored).not.toContain('stylesheets: ["');
			}
		});
		it('fails on a side-effect import of a package file with a declared non-css extension', () => {
			const { root } = fixture();
			mkdirSync(path.join(root, 'node_modules', 'some-lib'), { recursive: true });
			writeFileSync(path.join(root, 'node_modules', 'some-lib', 'package.json'), '{"name":"some-lib"}');
			writeFileSync(path.join(root, 'node_modules', 'some-lib', 'theme.scss'), '.theme {}');
			const attribute = (stylesheets?: StylesheetKinds) => () =>
				attributeComponentIdentity(
					`import 'some-lib/theme.scss';\nimport { eco } from '@ecopages/core';\nexport default eco.page({ render: () => '' });`,
					path.join(root, 'page.ts'),
					{ integration: 'lit', projectRoot: root, stylesheets },
				).code;
			expect(attribute(createStylesheetKinds([sass]))).toThrow(
				'page.ts: "some-lib/theme.scss" is a package stylesheet that is not CSS. Packages must ship built CSS',
			);
			expect(attribute(createStylesheetKinds([]))).not.toThrow();
		});
	});
	describe('package stylesheets', () => {
		function packageFixture() {
			const context = fixture();
			const write = (name: string, source: string) => {
				const file = path.join(context.root, name);
				mkdirSync(path.dirname(file), { recursive: true });
				writeFileSync(file, source);
				return file;
			};
			write(
				'node_modules/some-lib/package.json',
				JSON.stringify({
					name: 'some-lib',
					main: './index.js',
					exports: {
						'.': './index.js',
						'./style.css': { style: './dist/style.css', default: './dist/style.js' },
						'./dist/*': './dist/*',
						'./theme': './dist/theme.css',
						'./module.css': './dist/x.module.css',
					},
				}),
			);
			write('node_modules/some-lib/index.js', 'export const lib = 1;');
			write('node_modules/some-lib/dist/style.js', 'export {};');
			write('node_modules/some-lib/dist/style.css', '.some-lib {}');
			write('node_modules/some-lib/dist/theme.css', '.some-lib-theme {}');
			write('node_modules/some-lib/dist/x.module.css', '.x {}');
			const real = (name: string) => path.fromNative(realpathSync(path.join(context.root, name)));
			return { ...context, write, real };
		}

		it('resolves a package stylesheet through its exports with the style condition and strips the import', () => {
			const { transform } = packageFixture();
			const style = '|some-lib/dist/style.css';
			const result = transform(`import 'some-lib/style.css';\nimport 'some-lib/dist/style.css';`);
			expect(result).not.toContain(`import 'some-lib`);
			expect(result).toContain(`stylesheets: ${JSON.stringify([style])}`);
			expect(result).toContain(`packageStylesheets: ${JSON.stringify([style])}`);
		});
		it('reads a package import without .css as a stylesheet only when it resolves to one', () => {
			const { transform } = packageFixture();
			const result = transform(`import 'some-lib/theme';\nimport 'some-lib';`);
			expect(result).toContain(`stylesheets: ${JSON.stringify(['|some-lib/dist/theme.css'])}`);
			expect(result).not.toContain(`import 'some-lib/theme'`);
			expect(result).toContain(`import 'some-lib';`);
		});
		it('strips a package stylesheet named without .css from a plain module', () => {
			const { root, write } = packageFixture();
			write('theme.ts', `import 'some-lib/theme';\nexport const theme = 1;`);
			const code = attributeComponentIdentity(
				fileSystem.readFileSync(path.join(root, 'theme.ts')),
				path.join(root, 'theme.ts'),
				{ integration: 'lit', projectRoot: root },
			).code;
			expect(code).not.toContain('some-lib');
		});
		it('fails on a package CSS Module no Processor scopes and on a package stylesheet the package does not export', () => {
			const { transform } = packageFixture();
			expect(() => transform(`import 'some-lib/module.css';`)).toThrow(
				/page\.ts: "some-lib\/module\.css" is a CSS Module\..*@ecopages\/lightningcss-processor/u,
			);
			expect(() => transform(`import 'some-lib/missing.css';`)).toThrow(
				'Cannot resolve package stylesheet "some-lib/missing.css"',
			);
		});
		it('hands a package stylesheet of a plain module to the nearest declaration, after the declaration CSS', () => {
			const { root, write } = packageFixture();
			write('badge.css', '.badge {}');
			write('card.css', '.card {}');
			write('card.ts', `import 'some-lib/style.css';\nimport './card.css';\nexport const Card = () => '';`);
			write(
				'badge.ts',
				`import { eco } from '@ecopages/core';\nimport './badge.css';\nimport { Card } from './card';\nexport const Badge = eco.component({ render: () => Card() });`,
			);
			const attribute = (name: string) =>
				attributeComponentIdentity(fileSystem.readFileSync(path.join(root, name)), path.join(root, name), {
					integration: 'lit',
					projectRoot: root,
				}).code;
			const style = '|some-lib/dist/style.css';
			const badge = attribute('badge.ts');
			expect(badge).toContain(`stylesheets: ${JSON.stringify(['badge.css'])}`);
			expect(badge).toContain(`plainModuleStylesheets: ${JSON.stringify([style, 'card.css'])}`);
			expect(badge).toContain(`packageStylesheets: ${JSON.stringify([style])}`);
			expect(attribute('card.ts')).not.toContain('some-lib');
		});
	});
	it('names a package stylesheet from the folder of the module that imports it, with its version', () => {
		const { root, transform } = fixture();
		const install = (dir: string, version: string) => {
			const packageDir = path.join(root, dir, 'node_modules', 'dep');
			mkdirSync(packageDir, { recursive: true });
			writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'dep', version }));
			writeFileSync(path.join(packageDir, 'x.css'), `.v${version.replace(/\./g, '')} {}`);
		};
		install('.', '2.0.0');
		install('packages/ui', '1.0.0');
		writeFileSync(path.join(root, 'packages', 'ui', 'package.json'), JSON.stringify({ name: '@acme/ui' }));
		writeFileSync(
			path.join(root, 'packages', 'ui', 'badge.ts'),
			`import 'dep/x.css';\nexport const Badge = () => '';`,
		);

		const result = transform(`import 'dep/x.css';\nimport { Badge } from './packages/ui/badge';`);

		expect(result).toContain(
			`packageStylesheets: ${JSON.stringify(['|dep@2.0.0/x.css', 'packages/ui|dep@1.0.0/x.css'])}`,
		);
	});
	describe('a moved app', () => {
		/** Writes one app into a new folder, with `some-lib` in a pnpm-style store folder of `version`. */
		function appIn(version: string) {
			const { root, transform } = fixture();
			const packageDir = path.join(
				root,
				'node_modules',
				'.pnpm',
				`some-lib@${version}`,
				'node_modules',
				'some-lib',
			);
			mkdirSync(path.join(packageDir, 'css'), { recursive: true });
			writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'some-lib', version }));
			writeFileSync(path.join(packageDir, 'css', 'style.css'), '.some-lib {}');
			symlinkSync(packageDir, path.join(root, 'node_modules', 'some-lib'), 'junction');
			return transform(
				`import './style.css';\nimport 'some-lib/css/style.css';\nimport { Child } from './child';`,
			);
		}

		it('emits the same module from any folder, naming no path of the machine', () => {
			const first = appIn('1.0.0');
			const second = appIn('1.0.0');

			expect(second).toBe(first);
			expect(first).toContain('file: "page.ts"');
			expect(first).toContain(`stylesheets: ${JSON.stringify(['style.css', '|some-lib@1.0.0/css/style.css'])}`);
			expect(first).toContain(`packageStylesheets: ${JSON.stringify(['|some-lib@1.0.0/css/style.css'])}`);
			expect(first).toContain(`watchFiles: ${JSON.stringify(['child.ts'])}`);
			for (const root of roots) expect(first).not.toContain(path.fromNative(realpathSync(root)));
			expect(first).not.toContain('\\\\');
		});
	});
	it('reports missing relative or aliased imports with owner and specifier', () => {
		const { transform, root } = fixture();
		expect(() => transform(`import './missing.css';`)).toThrow(
			`Cannot resolve stylesheet import "./missing.css" from ${root}/page.ts`,
		);
		expect(() => transform(`import '@/missing.css';`)).toThrow(
			`Cannot resolve stylesheet import "@/missing.css" from ${root}/page.ts`,
		);
		expect(() => transform(`import { Child } from './missing';`)).toThrow(
			`Cannot resolve import "./missing" from ${root}/page.ts`,
		);
	});
	it('re-evaluates changed direct exports on the next transform', () => {
		const { root, transform } = fixture();
		expect(transform(`import { Child } from './child';`)).toContain('components: () => [Child]');
		writeFileSync(path.join(root, 'child.ts'), `export const Child = () => '';`);
		expect(transform(`import { Child } from './child';`)).not.toMatch(DISCOVERED_COMPONENT);
	});

	describe('plain modules', () => {
		function plainFixture() {
			const context = fixture();
			const { root } = context;
			const file = (name: string, source: string) => {
				writeFileSync(path.join(root, name), source);
				return path.fromNative(realpathSync(path.join(root, name)));
			};
			file('badge.css', '.badge {}');
			file('card.css', '.card {}');
			file('card-body.css', '.card-body {}');
			file(
				'badge.ts',
				`import { eco } from '@ecopages/core';\nimport './badge.css';\nimport { Card } from './card';\nexport const Badge = eco.component({ render: () => Card() });`,
			);
			file(
				'card.ts',
				`import { CardBody } from './card-body';\nimport './card.css';\nexport function Card() { return CardBody(); }`,
			);
			file('card-body.ts', `import './card-body.css';\nexport const CardBody = () => '';`);
			const attribute = (name: string, integration: string | null = 'lit', options = {}) =>
				attributeComponentIdentity(fileSystem.readFileSync(path.join(root, name)), path.join(root, name), {
					integration: integration ?? undefined,
					projectRoot: root,
					...options,
				}).code;
			return {
				...context,
				file,
				attribute,
				real: (name: string) => path.fromNative(realpathSync(path.join(root, name))),
			};
		}

		it('hands a plain component CSS to the nearest declaration, after its own CSS', () => {
			const { attribute } = plainFixture();
			const badge = attribute('badge.ts');
			expect(badge).toContain(`stylesheets: ${JSON.stringify(['badge.css'])}`);
			expect(badge).toContain(`plainModuleStylesheets: ${JSON.stringify(['card.css', 'card-body.css'])}`);
			expect(badge).toContain('"card.ts"');
			expect(badge).toContain('"card-body.ts"');
			expect(badge).toContain('components: () => []');
		});
		it('strips the CSS import of a plain module', () => {
			const { attribute } = plainFixture();
			expect(attribute('card.ts')).not.toContain('card.css');
		});
		it('fails at the end of a build when no declaration reaches a plain module CSS import', async () => {
			const { root } = plainFixture();
			const build = () =>
				getPluginTransform(
					createEcoComponentMetaPlugin({
						config: {
							rootDir: root,
							integrations: [{ name: 'lit', extensions: ['.ts'] }],
						} as EcoPagesAppConfig,
					}),
				);
			const read = (name: string) => fileSystem.readFileSync(path.join(root, name));
			const unreached = build();
			unreached.transform(read('card.ts'), path.join(root, 'card.ts'));
			await expect(unreached.end()).rejects.toThrow(
				'[ecopages] card.ts: "./card.css" never reaches a Page, because no eco.page(), eco.layout(), eco.html() or eco.component() module imports card.ts.',
			);
			const reached = build();
			reached.transform(read('card.ts'), path.join(root, 'card.ts'));
			reached.transform(read('badge.ts'), path.join(root, 'badge.ts'));
			await expect(reached.end()).resolves.toBeUndefined();
		});
		it('keeps a CSS Module import of a module no declaration reaches without failing the build', async () => {
			class ScopingProcessor extends Processor {
				async setup(): Promise<void> {}
			}
			const scoping = new ScopingProcessor({
				name: 'scoping',
				capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
			});
			const { root, file } = plainFixture();
			file('button.module.css', '.primary {}');
			file('button.ts', `import styles from './button.module.css';\nexport const Button = () => styles.primary;`);
			const run = getPluginTransform(
				createEcoComponentMetaPlugin({
					config: {
						rootDir: root,
						integrations: [{ name: 'lit', extensions: ['.ts'] }],
						processors: new Map([['scoping', scoping]]),
					} as unknown as EcoPagesAppConfig,
				}),
			);
			const kept = run.transform(
				fileSystem.readFileSync(path.join(root, 'button.ts')),
				path.join(root, 'button.ts'),
			);
			expect(typeof kept === 'string' ? kept : kept?.code).toContain(`import styles from './button.module.css'`);
			await expect(run.end()).resolves.toBeUndefined();
		});
		it('forgets a plain module once the only declaration importing it drops the import', async () => {
			const { root, file } = plainFixture();
			const plugin = createEcoComponentMetaPlugin({
				config: { rootDir: root, integrations: [{ name: 'lit', extensions: ['.ts'] }] } as EcoPagesAppConfig,
			});
			const read = (name: string) => fileSystem.readFileSync(path.join(root, name));
			const build = () => {
				const run = getPluginTransform(plugin);
				run.transform(read('badge.ts'), path.join(root, 'badge.ts'));
				run.transform(read('card.ts'), path.join(root, 'card.ts'));
				return run.end();
			};
			await expect(build()).resolves.toBeUndefined();
			file(
				'badge.ts',
				`import { eco } from '@ecopages/core';\nexport const Badge = eco.component({ render: () => '' });`,
			);
			await expect(build()).rejects.toThrow('[ecopages] card.ts: "./card.css" never reaches a Page');
		});
		it('shares plain module walks within a build without losing CSS through a cycle', () => {
			const { root, file } = plainFixture();
			file(
				'card-body.ts',
				`import './card-body.css';\nimport { Card } from './card';\nexport const CardBody = () => '';`,
			);
			file(
				'page.ts',
				`import { eco } from '@ecopages/core';\nimport { CardBody } from './card-body';\nexport default eco.page({ render: () => CardBody() });`,
			);
			const run = getPluginTransform(
				createEcoComponentMetaPlugin({
					config: {
						rootDir: root,
						integrations: [{ name: 'lit', extensions: ['.ts'] }],
					} as EcoPagesAppConfig,
				}),
			);
			const code = (name: string) => {
				const result = run.transform(fileSystem.readFileSync(path.join(root, name)), path.join(root, name));
				return typeof result === 'string' ? result : (result?.code ?? '');
			};
			expect(code('badge.ts')).toContain(JSON.stringify(['card.css', 'card-body.css']));
			expect(code('page.ts')).toContain(JSON.stringify(['card-body.css', 'card.css']));
		});
		it('strips the CSS import of a plain module no Integration owns', () => {
			const { attribute } = plainFixture();
			expect(attribute('card-body.ts', null)).not.toContain(`import './card-body.css'`);
		});
		it('fails on a CSS Module in a reached plain module', () => {
			const { attribute, file } = plainFixture();
			file('card-body.ts', `import styles from './card-body.module.css';\nexport const CardBody = () => styles;`);
			expect(() => attribute('badge.ts')).toThrow(
				'[ecopages] card-body.ts: "./card-body.module.css" is a CSS Module',
			);
		});
		it('re-reads a plain module import edit on the next transform', () => {
			const { attribute, file } = plainFixture();
			expect(attribute('badge.ts')).toContain('"card-body.css"');
			file('card.ts', `import './card.css';\nexport function Card() { return ''; }`);
			expect(attribute('badge.ts')).not.toContain('"card-body.css"');
		});
		it('follows named barrels and stops at Eco modules, export *, packages and .server modules', () => {
			const { attribute, file } = plainFixture();
			file('kit.css', '.kit {}');
			file('star.css', '.star {}');
			file('server.css', '.server {}');
			file('kit.ts', `export { Card } from './card';\nexport * from './star';`);
			file('star.ts', `import './star.css';\nexport const Star = () => '';`);
			file('data.server.ts', `import './server.css';\nexport const data = 1;`);
			file(
				'page.ts',
				`import { eco } from '@ecopages/core';\nimport { Card, Star } from './kit';\nimport { Badge } from './badge';\nimport { data } from './data.server';\nimport { html } from 'lit';\nexport default eco.page({ render: () => html\`\${Card()}\${Star()}\${Badge({})}\${data}\` });`,
			);
			const page = attribute('page.ts');
			expect(page).toContain(`plainModuleStylesheets: ${JSON.stringify(['card.css', 'card-body.css'])}`);
			expect(page).toContain('components: () => [Badge]');
			expect(page).toContain('"kit.ts"');
			expect(page).not.toContain('"star.ts"');
			expect(page).not.toContain('"badge.css"');
		});
		it('ends a cycle between plain modules and lists each stylesheet once', () => {
			const { attribute, file } = plainFixture();
			file(
				'card-body.ts',
				`import './card-body.css';\nimport { Card } from './card';\nimport { Badge } from './badge';\nexport const CardBody = () => '';`,
			);
			const badge = attribute('badge.ts');
			expect(badge).toContain(`plainModuleStylesheets: ${JSON.stringify(['card.css', 'card-body.css'])}`);
		});
		it('hands plain module CSS and Components to an MDX document', () => {
			const { root, file, real } = plainFixture();
			file(
				'icon.ts',
				`import { eco } from '@ecopages/core';\nexport const Icon = eco.component({ render: () => '' });`,
			);
			file(
				'card.ts',
				`import './card.css';\nimport { Icon } from './icon';\nexport function Card() { return Icon({}); }`,
			);
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"import { Card } from './card';",
				'export default function MDXContent() { return _jsx(Card, {}); }',
			].join('\n');
			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(result).toContain(`plainModuleStylesheets: ${JSON.stringify(['card.css'])}`);
			expect(result).toContain('components: () => [__ecoPlainModuleComponent0]');
			expect(result).toContain(`import { Icon as __ecoPlainModuleComponent0 } from "${real('icon.ts')}";`);
		});
		it('makes Eco Components a plain module imports Components of the declaration', () => {
			const { attribute, file, real } = plainFixture();
			file(
				'icon.ts',
				`import { eco } from '@ecopages/core';\nexport const Icon = eco.component({ render: () => '' });\nexport default Icon;`,
			);
			file('icons.ts', `export { Icon as Glyph } from './icon';`);
			file(
				'card-body.ts',
				`import './card-body.css';\nimport { Glyph } from './icons';\nimport Icon from './icon';\nexport const CardBody = () => \`\${Glyph({})}\${Icon({})}\`;`,
			);
			const badge = attribute('badge.ts');
			expect(badge).toContain('components: () => [__ecoPlainModuleComponent0, __ecoPlainModuleComponent1]');
			expect(badge).toContain(`import { Glyph as __ecoPlainModuleComponent0 } from "${real('icons.ts')}";`);
			expect(badge).toContain(`import __ecoPlainModuleComponent1 from "${real('icon.ts')}";`);
			file(
				'badge.ts',
				`import { eco } from '@ecopages/core';\nimport { Glyph } from './icons';\nimport { Card } from './card';\nexport const Badge = eco.component({ render: () => Card() + Glyph({}) });`,
			);
			const deduplicated = attribute('badge.ts');
			expect(deduplicated).toContain('components: () => [Glyph, __ecoPlainModuleComponent0]');
			expect(deduplicated).toContain(`import __ecoPlainModuleComponent0 from "${real('icon.ts')}";`);
		});
		it('fails when a plain component of another Integration is rendered, suggesting eco.component()', () => {
			const { file, attribute } = plainFixture();
			const integrationOf = (target: string) =>
				target.endsWith('.react.tsx')
					? { name: 'react', jsxImportSource: 'react' }
					: { name: 'kitajs', jsxImportSource: '@kitajs/html' };
			file('button.react.tsx', `export function Button() { return <button />; }\nexport const label = 'x';`);
			file(
				'page.kita.tsx',
				`import { eco } from '@ecopages/core';\nimport { Button, label } from './button.react';\nexport default eco.page({ render: () => <main>{label}<Button /></main> });`,
			);
			expect(() => attribute('page.kita.tsx', 'kitajs', { integrationOf })).toThrow(
				'[ecopages] page.kita.tsx renders Button from button.react.tsx, a plain react component, inside kitajs. Plain components do not cross Integrations: wrap Button in eco.component() so react renders it as a Foreign Child.',
			);
			file(
				'button.react.tsx',
				`import { eco } from '@ecopages/core';\nexport const Button = eco.component({ render: () => <button /> });\nexport const label = 'x';`,
			);
			expect(attribute('page.kita.tsx', 'kitajs', { integrationOf })).toContain('components: () => [Button]');
		});
		it('allows a plain component of another Integration that compiles JSX with the same runtime', () => {
			const { file, attribute } = plainFixture();
			const integrationOf = (target: string) =>
				target.endsWith('.lit.tsx') ? { name: 'lit' } : { name: 'kitajs', jsxImportSource: '@kitajs/html' };
			file('card.kita.tsx', `export function Card() { return <article />; }`);
			file(
				'page.lit.tsx',
				`import { eco } from '@ecopages/core';\nimport { Card } from './card.kita';\nexport default eco.page({ render: () => <main><Card /></main> });`,
			);
			expect(() => attribute('page.lit.tsx', 'lit', { integrationOf })).not.toThrow();
			file(
				'page.react.tsx',
				`/** @jsxImportSource @kitajs/html */\nimport { eco } from '@ecopages/core';\nimport { Card } from './card.kita';\nexport default eco.page({ render: () => <main><Card /></main> });`,
			);
			const withPragma = (target: string) =>
				target.endsWith('.react.tsx')
					? { name: 'react', jsxImportSource: 'react' }
					: { name: 'kitajs', jsxImportSource: '@kitajs/html' };
			expect(() => attribute('page.react.tsx', 'react', { integrationOf: withPragma })).not.toThrow();
		});
		it('allows a helper of another Integration that the importer does not render', () => {
			const { file, attribute } = plainFixture();
			const integrationOf = (target: string) =>
				target.endsWith('.react.tsx')
					? { name: 'react', jsxImportSource: 'react' }
					: { name: 'kitajs', jsxImportSource: '@kitajs/html' };
			file('helpers.react.tsx', `export const Label = 'x';\nexport function format() { return ''; }`);
			file(
				'page.kita.tsx',
				`import { eco } from '@ecopages/core';\nimport { Label, format } from './helpers.react';\nexport default eco.page({ render: () => <main>{Label}{format()}</main> });`,
			);
			expect(() => attribute('page.kita.tsx', 'kitajs', { integrationOf })).not.toThrow();
		});
	});

	describe('MDX component import discovery and attribution', () => {
		it('discovers component and stylesheet imports in MDX and strips bare CSS', () => {
			const { root } = fixture();
			const stylePath = 'style.css';
			const mdxJs = [
				"import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'function _createMdxContent(props) { return _jsx("h1", { children: "Hi" }); }',
				'export default function MDXContent(props = {}) { return _createMdxContent(props); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(result).not.toContain("import './style.css';");
			expect(result).toContain("import { Child } from './child';");
			expect(result).toContain(
				"import { bindComponentIdentity, attachDiscoveredDependencies } from '@ecopages/core';",
			);
			expect(result).toContain(`components: () => [Child], stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
			expect(result).toContain("if (typeof MDXContent === 'function') MDXContent.config = config;");
		});

		it('preserves existing export const config and merges discovered dependencies', () => {
			const { root } = fixture();
			const stylePath = 'style.css';
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import '@/style.css';",
				'export const config = { layout: "custom-layout" };',
				'export default function MDXContent() { return _jsx("div", {}); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(result).not.toContain("import '@/style.css';");
			expect(result).toContain('layout: "custom-layout"');
			expect(result).toContain(`components: () => [Child], stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
		});

		it('distinguishes top-level imports from imports and functions inside code blocks', () => {
			const { root } = fixture();
			const stylePath = 'style.css';
			const mdxJs = [
				"import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'function helper() {',
				'  const dynamic = import("./fake.css");',
				'}',
				'function _createMdxContent(props) {',
				'  return _jsxs("div", {',
				'    children: [',
				'      _jsx("pre", {',
				'        children: _jsx("code", {',
				"          children: \"import './fake.css';\\nimport { Fake } from './fake';\"",
				'        })',
				'      })',
				'    ]',
				'  });',
				'}',
				'export default function MDXContent() { return _createMdxContent(); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			// Real top-level bare CSS import was stripped
			expect(result).not.toContain("import './style.css';");
			// Fake CSS import inside the code block is completely preserved
			expect(result).toContain("children: \"import './fake.css';\\nimport { Fake } from './fake';\"");
			// Fake CSS and dynamic imports are NOT added to discovered dependencies
			expect(result).toContain(`stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('components: () => [Child]');
			expect(result).not.toContain('components: () => [Child, Fake]');
		});

		it('is idempotent when run multiple times on the same MDX output', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'export default function MDXContent() { return _jsx("h1", {}); }',
			].join('\n');

			const first = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			const second = attributeMdxComponentIdentity(first, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(second).toBe(first);
		});

		it('throws an error if projectRoot is missing', () => {
			const mdxJs = 'export default function MDXContent() { return null; }';
			expect(() => attributeMdxComponentIdentity(mdxJs, '/path/post.mdx', 'mdx', '')).toThrow(
				/projectRoot is required/,
			);
		});

		it('always attributes identity even when MDX has no discovered dependencies', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				'export default function MDXContent() { return _jsx("h1", {}); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
			expect(result).toContain("if (typeof MDXContent === 'function') MDXContent.config = config;");
		});

		it('does not re-wrap export const config that is already a bindComponentIdentity call', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { bindComponentIdentity, attachDiscoveredDependencies } from '@ecopages/core';",
				"export const config = bindComponentIdentity({ id: 'abc', file: '/post.mdx', integration: 'mdx' }, { layout: 'base' });",
				'attachDiscoveredDependencies(config);',
				'export default function MDXContent() { return null; }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root).code;
			expect(result).toBe(mdxJs);
		});
	});
});
