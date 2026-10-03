import path from 'node:path';
import { expect, test } from 'vitest';
import { readSchema } from '../.agents/skills/github-cli/scripts/create-issues.mts';

test('every issue form sets an issue type and every default label it adds is in labels.yml', () => {
	const schema = readSchema(path.resolve(import.meta.dirname, '..'));
	for (const [name, form] of schema.forms) {
		expect(form.type, name).toMatch(/^(Bug|Task|Feature)$/);
		for (const label of form.labels) expect(schema.labels?.has(label), `${name}: ${label}`).toBe(true);
	}
});
