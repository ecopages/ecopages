# @ecopages/bun-mdx-kitajs-loader

A Bun plugin that processes `.mdx` files

Just add this plugin to your bunfig.toml file and it will process all `.mdx` files

```toml
preload = ["@ecopages/bun-mdx-kitajs-loader"]
```

Behind the scenes it uses [`@mdx-js/esbuild`](https://mdxjs.com/packages/esbuild/)
