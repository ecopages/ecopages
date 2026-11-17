import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import transform from './migrate-radiant-bindings.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-radiant-bindings');

const j = jscodeshift.withParser('tsx');

function runRaw(source: string, report: (message: string) => void = () => {}, filePath = 'fixture.tsx'): string | null {
	return transform({ path: filePath, source }, { jscodeshift: j, report } as never, {});
}

async function runTransform(source: string, report?: (message: string) => void): Promise<string | null> {
	const result = runRaw(source, report);
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig('fixture.tsx');
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.tsx`), 'utf-8');
}

const header = "import { FormAssociatedElement, RadiantElement, prop, state } from '@ecopages/radiant';\n";

describe('migrate-radiant-bindings', () => {
	it.each(['companion-reads', 'bind-options', 'type-arguments'])('migrates %s', async (name) => {
		const report = vi.fn();
		expect(await runTransform(readFixture(name, 'input'), report)).toBe(readFixture(name, 'output'));
		expect(report).not.toHaveBeenCalled();
	});

	it('leaves this.$, its reads and unrelated $-prefixed members unchanged', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('already-migrated', 'input'), report)).toBeNull();
		expect(report).not.toHaveBeenCalled();
	});

	it('is idempotent', async () => {
		for (const name of ['companion-reads', 'bind-options', 'type-arguments']) {
			expect(await runTransform(readFixture(name, 'output'))).toBeNull();
		}
	});

	it('keeps the source formatting: spaces, CRLF line endings and JSX text', () => {
		const source = [
			header.trimEnd(),
			'',
			'export class Spaced extends RadiantElement<{',
			'    label: string;',
			'}> {',
			'    @state label = "a";',
			'    @prop({ type: Number }) count = 0;',
			'    render() {',
			'        return <p>{this.$label} / {this.$count}</p>;',
			'    }',
			'}',
			'',
		].join('\r\n');
		expect(runRaw(source)).toBe(
			source
				.replace('    label: string;\r\n', '    label: string;\r\n    count: number;\r\n')
				.replace('{this.$label} / {this.$count}', '{this.$.label} / {this.$.count}'),
		);
	});

	it('removes a declare that typed a companion, with its comment and its line', () => {
		const source = `${header}class A extends RadiantElement<{ count: number }> {\n\t@state count = 0;\n\t/** The companion. */\n\tdeclare $count: unknown;\n\tread() {\n\t\treturn this.$count;\n\t}\n}\n`;
		expect(runRaw(source)).toBe(
			source
				.replace('\t/** The companion. */\n\tdeclare $count: unknown;\n', '')
				.replace('this.$count', 'this.$.count'),
		);
	});

	it('does not add a type argument in a JavaScript file', () => {
		const source = `${header}export class Plain extends RadiantElement {\n\t@state count = 0;\n\trender() {\n\t\treturn this.$count;\n\t}\n}\n`;
		expect(runRaw(source, () => {}, 'plain.jsx')).toBe(source.replace('this.$count', 'this.$.count'));
	});

	it('removes bind: false but keeps and reports a $name read of that member, which read undefined', () => {
		const report = vi.fn();
		const source = `${header}class A extends RadiantElement<{ count: number }> {\n\t@prop({ type: Number }) count = 0;\n\tread() {\n\t\treturn this.$count;\n\t}\n}\nclass B extends RadiantElement {\n\t@prop({ type: Number, bind: false }) count = 0;\n\tread() {\n\t\treturn this.$count;\n\t}\n}\n`;
		expect(runRaw(source, report)).toBe(
			source
				.replace('this.$count', 'this.$.count')
				.replace('@prop({ type: Number, bind: false })', '@prop({ type: Number })'),
		);
		expect(report).toHaveBeenCalledOnce();
		expect(report).toHaveBeenCalledWith(
			expect.stringContaining('fixture.tsx:11: reads $count, but the member had no companion'),
		);
	});

	it('keeps the options object of a callee that requires one', () => {
		const source = `${header}class A extends RadiantElement {\n\tconstructor() {\n\t\tsuper();\n\t\tthis.createReactiveProp('count', { bind: true });\n\t\tthis.createReactiveField('draft', '', { bind: true });\n\t}\n}\n`;
		const output = runRaw(source);
		expect(output).toContain("this.createReactiveProp('count', {});");
		expect(output).toContain("this.createReactiveField('draft', '');");
	});

	describe('reports', () => {
		const cases: Array<[string, string, string, number]> = [
			[
				'a ReactiveBindingOption import',
				"import type { ReactiveBindingOption } from '@ecopages/radiant/core/radiant-element';\nexport const bind: ReactiveBindingOption = true;\n",
				'imports ReactiveBindingOption',
				1,
			],
			[
				'a defineReactiveBinding call',
				`${header}class A extends RadiantElement {\n\tconstructor() {\n\t\tsuper();\n\t\tthis.defineReactiveBinding('count', true);\n\t}\n}\n`,
				'uses defineReactiveBinding',
				5,
			],
			[
				'a shouldAutoBindReactiveMembers override',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\tprotected shouldAutoBindReactiveMembers() {\n\t\treturn false;\n\t}\n}\n`,
				'overrides shouldAutoBindReactiveMembers',
				4,
			],
			[
				'a computed $-prefixed read',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\tread(name: string) {\n\t\treturn this[\`$\${name}\`];\n\t}\n}\n`,
				'computed key',
				5,
			],
			[
				'options it cannot read',
				`${header}const options = { type: Number };\nclass A extends RadiantElement {\n\t@prop(options) count = 0;\n\tread() {\n\t\treturn this.$count;\n\t}\n}\n`,
				'cannot tell whether the member had a companion',
				6,
			],
			[
				'a bind value it cannot read',
				`${header}const shouldBind = true;\nclass A extends RadiantElement {\n\t@prop({ type: Number, bind: shouldBind }) count = 0;\n}\n`,
				'bind option this codemod cannot read',
				4,
			],
			[
				'a custom bind on a member it cannot place',
				`${header}export const decorate = prop({ type: Number, bind: 'total' });\n`,
				"bind: 'total'",
				2,
			],
			[
				'a read of a member whose bind is unknown because the host opts out',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\tread() {\n\t\treturn this.$count;\n\t}\n\tshouldAutoBindReactiveMembers() {\n\t\treturn false;\n\t}\n}\n`,
				'cannot tell whether the member had a companion',
				5,
			],
			[
				'a write to a companion',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\treset() {\n\t\tthis.$count = null;\n\t}\n}\n`,
				'writes $count',
				5,
			],
			[
				'a companion destructured from this',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\tread() {\n\t\tconst { $count } = this;\n\t\treturn $count;\n\t}\n}\n`,
				'destructures $count',
				5,
			],
			[
				'a companion read outside its class',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n}\nexport const read = (element: A) => element.$count;\n`,
				'reads $count outside the class',
				5,
			],
			[
				'a $name read in a class whose base is in another file',
				`${header}import { BaseCard } from './base-card';\nclass A extends BaseCard {\n\tread() {\n\t\treturn this.$count;\n\t}\n}\n`,
				'base is outside this file',
				5,
			],
			[
				'a field that shadows the companion',
				`${header}class A extends RadiantElement {\n\t@state count = 0;\n\t$count!: unknown;\n\tread() {\n\t\treturn this.$count;\n\t}\n}\n`,
				'also declares as a field',
				6,
			],
		];

		it.each(cases)('leaves %s unchanged and reports its line', (_name, source, reason, line) => {
			const report = vi.fn();
			const output = runRaw(source, report);
			expect(output === null || !output.includes('this.$.')).toBe(true);
			expect(report).toHaveBeenCalledWith(expect.stringContaining(`fixture.tsx:${line}: `));
			expect(report).toHaveBeenCalledWith(expect.stringContaining(reason));
		});

		it('rewrites a read but reports a type it cannot tell', () => {
			const report = vi.fn();
			const source = `${header}class A extends RadiantElement {\n\t@prop({ type: Object }) config = createConfig();\n\trender() {\n\t\treturn this.$config;\n\t}\n}\n`;
			expect(runRaw(source, report)).toBe(source.replace('this.$config', 'this.$.config'));
			expect(report).toHaveBeenCalledOnce();
			expect(report).toHaveBeenCalledWith(
				expect.stringContaining('fixture.tsx:3: cannot tell the type of config'),
			);
		});

		it('rewrites a read but reports the binding types of a base that takes no type argument', () => {
			const report = vi.fn();
			const source = `${header}class Field extends FormAssociatedElement {\n\t@state value = '';\n\trender() {\n\t\treturn this.$value;\n\t}\n}\n`;
			expect(runRaw(source, report)).toBe(source.replace('this.$value', 'this.$.value'));
			expect(report).toHaveBeenCalledWith(
				expect.stringContaining('fixture.tsx:2: reads this.$.value in a class that does not extend'),
			);
		});
	});
});
