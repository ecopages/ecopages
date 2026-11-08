import { describe, expect, test } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { insertReference, withReference } from '../presets/tailwind-reference.ts';

const reference = path.resolve('/app/src/styles/tailwind.css');
const statement = `@reference "${reference}";`;

describe('insertReference', () => {
	test('puts the reference first in a stylesheet with no leading statements', () => {
		expect(insertReference('.a { @apply p-4; }', reference)).toBe(`${statement}\n\n.a { @apply p-4; }`);
	});

	test('puts the reference after the @charset, @import and empty @layer statements that open the stylesheet', () => {
		const css = `@charset "utf-8";\n@layer base, components;\n@import "./a.css";\n@import url("b;c.css") layer(x);\n.a { @apply p-4; }`;

		expect(insertReference(css, reference)).toBe(
			`@charset "utf-8";\n@layer base, components;\n@import "./a.css";\n@import url("b;c.css") layer(x);\n${statement}\n.a { @apply p-4; }`,
		);
	});

	test('does not go past a rule, a layer block or an @import written after one', () => {
		expect(insertReference('@layer base { a { color: red; } }\n@import "./a.css";', reference)).toBe(
			`${statement}\n\n@layer base { a { color: red; } }\n@import "./a.css";`,
		);
		expect(insertReference('.a { color: red; }\n@import "./a.css";', reference)).toBe(
			`${statement}\n\n.a { color: red; }\n@import "./a.css";`,
		);
	});

	test('counts leading comments as part of the opening statements', () => {
		expect(insertReference('/* header */\n@import "./a.css";\n.a {}', reference)).toBe(
			`/* header */\n@import "./a.css";\n${statement}\n.a {}`,
		);
	});

	test('keeps a byte order mark first', () => {
		expect(insertReference('﻿@import "./a.css";\n.a {}', reference)).toBe(
			`﻿@import "./a.css";\n${statement}\n.a {}`,
		);
		expect(insertReference('﻿.a {}', reference)).toBe(`﻿${statement}\n\n.a {}`);
	});

	test('handles an @import without a closing semicolon', () => {
		expect(insertReference('@import "./a.css"', reference)).toBe(`@import "./a.css"\n${statement}`);
	});
});

describe('withReference', () => {
	const file = path.resolve('/app/src/pages/index.css');

	test('leaves the Tailwind entry, a stylesheet that references it and one that imports it as written', () => {
		expect(withReference('.a { @apply p-4; }', reference, reference)).toBe('.a { @apply p-4; }');
		expect(withReference(`@reference "../tailwind.css";\n.a { @apply p-4; }`, file, reference)).toContain(
			'@reference "../tailwind.css"',
		);
		const imported = `@import "${reference}";\n.a { @apply p-4; }`;
		expect(withReference(imported, file, reference)).toBe(imported);
	});

	test('adds the reference to a stylesheet that uses @apply and to every CSS Module, and to no other', () => {
		expect(withReference('.a { @apply p-4; }', file, reference)).toContain(statement);
		expect(withReference('.a { color: red; }', '/app/src/a.module.css', reference)).toContain(statement);
		expect(withReference('.a { color: red; }', file, reference)).toBe('.a { color: red; }');
	});

	test('points an @import of tailwindcss at the entry so the theme applies', () => {
		expect(withReference('@import "tailwindcss";\n.a { @apply p-4; }', file, reference)).toBe(
			`@import '${reference}';\n.a { @apply p-4; }`,
		);
	});
});
