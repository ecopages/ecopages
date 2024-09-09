import { PostCssProcessor } from '@ecopages/postcss-processor';

export const css = async (strings: TemplateStringsArray, ...values: any[]) => {
  const css = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
  return await PostCssProcessor.processStringOrBuffer(css);
};
