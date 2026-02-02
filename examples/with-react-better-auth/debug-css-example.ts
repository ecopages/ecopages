import { PostCssProcessor } from '@ecopages/postcss-processor/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import path from 'node:path';

const css = `
.layout {
	background: white;
	&__header {
		@apply bg-blue-500;
	}
}
`;

const referencePath = path.resolve('src/styles/app.css');
const filePath = path.resolve('src/layouts/base-layout.css');

const preset = tailwindV4Preset({ referencePath });

async function run() {
	const transformedInput = await preset.transformInput(css, filePath);
	console.log('--- Transformed Input ---');
	console.log(transformedInput);

	const processed = await PostCssProcessor.processStringOrBuffer(transformedInput, {
		filePath,
		plugins: Object.values(preset.plugins),
	});

	console.log('--- Processed Output ---');
	console.log(processed);
}

run().catch(console.error);
