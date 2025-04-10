export const css = async (strings: TemplateStringsArray, ...values: any[]): Promise<string> => {
  const css = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
  // return await PostCssProcessor.processStringOrBuffer(css);
  return css;
};
