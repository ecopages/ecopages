import { describe, expect, it } from 'vitest';
import { runBuiltinChecks } from './run-a11y-checks.ts';

function createDocument(html: string): Document {
	const template = document.createElement('template');
	template.innerHTML = html.trim();
	const doc = document.implementation.createHTMLDocument('a11y-test');
	doc.body.replaceChildren(...Array.from(template.content.childNodes).map((node) => node.cloneNode(true)));
	return doc;
}

function issueSnapshot(issues: ReturnType<typeof runBuiltinChecks>) {
	return issues.map((issue) => ({
		id: issue.id,
		message: issue.message,
		severity: issue.severity,
		source: issue.source,
	}));
}

describe('runBuiltinChecks', () => {
	it('reports builtin issues in document order', () => {
		const doc = createDocument(`
			<img src="/hero.png" />
			<input />
			<h1>Title</h1>
			<h3>Section</h3>
		`);

		const issues = runBuiltinChecks(doc);

		expect(issueSnapshot(issues)).toEqual([
			{
				id: 'img-alt',
				message: 'Image is missing alt text',
				severity: 'error',
				source: 'builtin',
			},
			{
				id: 'form-label',
				message: 'Form control is missing an accessible label',
				severity: 'error',
				source: 'builtin',
			},
			{
				id: 'heading-order',
				message: 'Heading level skips from h1 to h3',
				severity: 'warning',
				source: 'builtin',
			},
		]);
	});

	it('ignores hidden inputs and honors aria labels', () => {
		const doc = createDocument(`
			<input type="hidden" name="token" value="secret" />
			<input aria-label="Search" />
		`);

		const issues = runBuiltinChecks(doc);

		expect(issues).toEqual([]);
	});

	it('reports duplicate ids', () => {
		const doc = createDocument(`
			<div id="panel"></div>
			<section id="panel"></section>
		`);

		const issues = runBuiltinChecks(doc);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.id).toBe('duplicate-id');
		expect(issues[0]?.message).toBe('Duplicate id "panel"');
	});

	it('skips nodes inside eco-dev-toolbar', () => {
		const doc = createDocument(`
			<eco-dev-toolbar>
				<img src="/logo.png" />
				<input />
			</eco-dev-toolbar>
			<img src="/content.png" alt="Decorative" />
		`);

		const issues = runBuiltinChecks(doc);

		expect(issues).toEqual([]);
	});
});
