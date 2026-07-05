import { expect, test } from 'vitest';
import { collectMdxSpreadIdentifiers, prependMdxImageImports } from './inject-mdx-image-imports';

test('collectMdxSpreadIdentifiers ignores fenced code blocks', () => {
	const source = `\`\`\`tsx
{...exampleImage}
\`\`\`

<EcoImage {...exampleImage} />
`;

	expect(collectMdxSpreadIdentifiers(source)).toEqual(['exampleImage']);
});

test('prependMdxImageImports adds only known image exports', () => {
	const source = '<EcoImage {...knownImage} />';
	const result = prependMdxImageImports(source, { knownImage: {} }, 'virtual:images');

	expect(result).toMatch(/^import \{ knownImage \} from 'virtual:images'/);
});
