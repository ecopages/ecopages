import { ConfigBuilder } from '../../src/config/config-builder';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type FixtureProcessor =
	Awaited<ReturnType<ConfigBuilder['build']>>['processors'] extends Map<string, infer T> ? T : never;

const builder = new ConfigBuilder().setRootDir(import.meta.dir);

if (process.env.ECOPAGES_USE_POSTCSS_PROCESSOR === 'true') {
	const postcssPluginPath = path.resolve(import.meta.dir, '../../../processors/postcss-processor/src/plugin.ts');
	const { postcssProcessorPlugin } = (await import(pathToFileURL(postcssPluginPath).href)) as {
		postcssProcessorPlugin: () => FixtureProcessor;
	};

	builder.setProcessors([postcssProcessorPlugin()]);
}

const config = await builder.build();

export default config;
