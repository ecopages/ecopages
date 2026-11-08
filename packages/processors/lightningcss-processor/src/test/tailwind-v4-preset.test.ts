import { afterEach, describe, expect, test } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { TAILWIND_FLAGS } from '../presets/tailwind-v4.ts';
import { createTailwindApp, removeTailwindApps } from './tailwind-app.ts';

afterEach(removeTailwindApps);

describe('tailwindV4Preset', () => {
	test('repeats the Tailwind flags it reads as the installed Tailwind defines them', async () => {
		const { Features, Polyfills } = (await import('@tailwindcss/node')) as unknown as Record<
			string,
			Record<string, number>
		>;

		expect(TAILWIND_FLAGS).toEqual({
			featuresNone: Features.None,
			featuresUtilities: Features.Utilities,
			polyfillsAll: Polyfills.All,
			polyfillsAtProperty: Polyfills.AtProperty,
		});
	});

	test('generates the utilities the app uses, without PostCSS', async () => {
		const { processor, write, referencePath } = await createTailwindApp();
		write('src/pages/index.tsx', '<div className="bg-rose-600 text-brand" />');

		const { css } = await processor.transformStylesheet(
			'@import "tailwindcss";\n@theme { --color-brand: #ff0000; }\n',
			referencePath,
		);

		expect(css).toMatch(/\.bg-rose-600\s*\{/u);
		expect(css).toMatch(/\.text-brand\s*\{/u);
		expect(css).not.toMatch(/\.text-amber-500\s*\{/u);
	});

	test('runs the Lightning CSS steps over the generated CSS', async () => {
		const { processor, write, referencePath } = await createTailwindApp({ minify: true, targets: ['chrome 90'] });
		write('src/pages/index.tsx', '<div className="p-4" />');

		const { css } = await processor.transformStylesheet(
			'@import "tailwindcss";\n.card { & .title { margin: 0; } }',
			referencePath,
		);

		expect(css.replace(/^\/\*!.*?\*\/\n/u, '')).not.toContain('\n');
		expect(css).toContain('.card .title{margin:0}');
		expect(css).toMatch(/\.p-4\{/u);
	});

	test('applies the utilities of @apply through an @reference to the entry, emitting nothing of the entry', async () => {
		const { processor, write } = await createTailwindApp();
		write('src/pages/index.tsx', '<div className="bg-rose-600" />');
		const file = write('src/pages/index.css', '.btn { @apply bg-brand p-4; }');

		const { css, dependencies } = await processor.transformStylesheet('.btn { @apply bg-brand p-4; }', file);

		expect(css).toContain('.btn');
		expect(css).toMatch(/background-color:\s*var\(--color-brand/u);
		expect(css).toMatch(/padding:/u);
		expect(css).not.toContain('.bg-rose-600');
		expect(css).not.toContain('@layer');
		expect(dependencies).toContain(path.join(path.dirname(path.dirname(file)), 'styles/tailwind.css'));
	});

	test('keeps the imports of a stylesheet that uses @apply', async () => {
		const { processor, write } = await createTailwindApp();
		write('src/pages/part.css', '.part { color: blue; }');
		const source = '@import "./part.css";\n.btn { @apply p-4; }';
		const file = write('src/pages/index.css', source);

		const { css, dependencies } = await processor.transformStylesheet(source, file);

		expect(css).toContain('.part');
		expect(css).toContain('.btn');
		expect(dependencies).toContain(path.join(path.dirname(file), 'part.css'));
	});

	test('scopes a CSS Module that uses @apply and applies the utilities to the scoped class', async () => {
		const { processor, write } = await createTailwindApp();
		const source = '.card { @apply bg-brand p-4; }\n.title { @apply text-brand; }';
		const file = write('src/components/card.module.css', source);

		const { css, exports } = await processor.transformStylesheet(source, file);

		expect(Object.keys(exports ?? {})).toEqual(['card', 'title']);
		const scoped = exports!.card!.split(' ')[0]!;
		expect(css).toMatch(new RegExp(`\\.${scoped}\\s*\\{[^}]*padding:`, 'u'));
		expect(css).not.toContain('@property');
		expect(css).not.toContain('.bg-brand');
	});

	test('leaves a stylesheet with no Tailwind syntax as the plain Processor would write it', async () => {
		const { processor, write } = await createTailwindApp({ minify: true });
		const file = write('src/pages/plain.css', '.a {\n  color: red;\n}\n');

		const { css } = await processor.transformStylesheet('.a {\n  color: red;\n}\n', file);

		expect(css).toBe('.a{color:red}');
	});

	test('resolves a tsconfig alias imported from a Tailwind stylesheet', async () => {
		const { processor, write } = await createTailwindApp();
		write(
			'tsconfig.json',
			JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@styles/*': ['src/styles/*'] } } }),
		);
		write('src/styles/tokens.css', '.token { color: green; }');
		const source = '@import "@styles/tokens.css";\n.a { @apply p-4; }';
		const file = write('src/pages/index.css', source);

		const { css } = await processor.transformStylesheet(source, file);

		expect(css).toContain('.token');
	});

	test('fails a stylesheet that applies a utility that does not exist, naming the file', async () => {
		const { processor, write } = await createTailwindApp();
		const source = '.a { @apply not-a-utility; }';
		const file = write('src/pages/broken.css', source);

		await expect(processor.transformStylesheet(source, file)).rejects.toThrow(/broken\.css.*not-a-utility/su);
	});

	test('keeps the message of a Tailwind syntax error without a made-up position', async () => {
		const { processor, write } = await createTailwindApp();
		const source = '@import "tailwindcss";\n.a { content: "unterminated; }';
		const file = write('src/pages/syntax.css', source);

		const error = await processor.transformStylesheet(source, file).catch((caught: Error) => caught);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain('syntax.css');
		expect((error as Error).message).not.toContain('undefined');
	});
});
