---
'@ecopages/ecopages-jsx': minor
'@ecopages/mdx': minor
'@ecopages/react': minor
---

Remove `enabled` from React and Ecopages JSX MDX options. Providing the `mdx` object now enables MDX; omit it to
disable MDX. Move remark, rehype, and recma plugin lists from `compilerOptions` to the top level of the `mdx` options.
