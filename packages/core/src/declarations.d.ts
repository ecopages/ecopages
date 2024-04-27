declare module '*.shadow.css' {
  const styles: string;
  export default styles;
}

declare module '*.css?inline' {
  const styles: string;
  export default styles;
}

declare module '*.mdx' {
  let MDXComponent: (props: any) => JSX.Element;
  export default MDXComponent;
}

export type {};
