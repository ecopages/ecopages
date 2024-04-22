import { PostCssProcessor } from '@/build/postcss-processor';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import { plugin } from 'bun';

plugin({
  name: 'inline-postcss-loader',
  setup(build) {
    appLogger.debug('Setting up inline-postcss-loader');
    const postcssFilter = /\.css/;

    build.onLoad({ filter: postcssFilter }, async (args) => {
      const text = await FileUtils.get(args.path).then((res) => res.text());
      const contents = await PostCssProcessor.processString(text);
      return {
        contents,
        exports: { default: contents },
        loader: 'object',
      };
    });
  },
});
