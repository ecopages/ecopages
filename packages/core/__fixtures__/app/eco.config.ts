import { ConfigBuilder } from '@ecopages/core/config-builder';
import { postcssProcessorPlugin } from '../../../processors/postcss-processor/src/plugin.ts';

const config = await new ConfigBuilder().setRootDir(import.meta.dir).setProcessors([postcssProcessorPlugin()]).build();

export default config;
