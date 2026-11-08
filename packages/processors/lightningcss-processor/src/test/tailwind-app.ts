import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { path } from '@ecopages/file-system/path';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin.ts';
import { tailwindV4Preset } from '../presets/tailwind-v4.ts';

const roots: string[] = [];

/** Removes the apps `createTailwindApp` made. */
export function removeTailwindApps(): void {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
}

/**
 * An app in a new temporary folder with Tailwind v4 installed and a Tailwind entry at `src/styles/tailwind.css`,
 * whose Processor runs the preset.
 *
 * @remarks
 * `tailwindcss` is linked into the app's `node_modules` so `@import "tailwindcss"` resolves from the temporary folder.
 */
export async function createTailwindApp(
	options: LightningCssProcessorPluginConfig = {},
	entry = '@import "tailwindcss";\n@theme { --color-brand: #ff0000; }\n',
) {
	const rootDir = path.fromNative(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-tailwind-'))));
	roots.push(rootDir);
	const write = (relativePath: string, contents: string) => {
		const file = path.join(rootDir, relativePath);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, contents);
		return file;
	};
	fs.mkdirSync(path.join(rootDir, 'node_modules'), { recursive: true });
	fs.symlinkSync(
		path.dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json')),
		path.join(rootDir, 'node_modules/tailwindcss'),
		'junction',
	);
	const referencePath = write('src/styles/tailwind.css', entry);
	const processor = new LightningCssProcessorPlugin({
		options: { ...tailwindV4Preset({ referencePath }), ...options },
	});
	const config = await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist', processors: [processor] });
	processor.setContext(config);
	return { rootDir, referencePath, processor, config, write };
}
