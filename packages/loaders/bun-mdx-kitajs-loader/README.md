# Bun MDX Loader (kitajs)

A Bun plugin that processes `.mdx` files

## Install

```bash
bunx jsr add @ecopages/bun-mdx-kitajs-loader
```

## Usage

Just add this plugin to your bunfig.toml file and it will process all `.mdx` files

```toml
preload = ["@ecopages/bun-mdx-kitajs-loader"]
```

Behind the scenes it uses [`@mdx-js/esbuild`](https://mdxjs.com/packages/esbuild/)
