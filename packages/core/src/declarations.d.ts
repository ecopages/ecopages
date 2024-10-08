declare global {
  var ecoConfig: EcoPagesAppConfig;
}

declare module '*.css' {
  const styles: string;
  export default styles;
}

declare module '*.mdx' {
  let MDXComponent: (props: any) => JSX.Element;
  export default MDXComponent;
}

declare module 'ghtml' {
  type UnescapedExpression = {
    rawValue: any;
  };

  export function html(strings: TemplateStringsArray, ...values: (any | UnescapedExpression)[]): string;

  export function htmlGenerator(
    strings: TemplateStringsArray,
    ...values: (any | UnescapedExpression)[]
  ): Generator<string, void, unknown>;

  export function htmlAsyncGenerator(
    strings: TemplateStringsArray,
    ...values: (any | UnescapedExpression | Promise<any>)[]
  ): AsyncGenerator<string, void, unknown>;

  export function includeFile(filePath: string): string;
}
