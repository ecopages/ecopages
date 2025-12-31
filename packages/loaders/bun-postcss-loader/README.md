# Bun Postcss Loader

## Deprecated

This loader is deprecated in favor of the [`@ecopages/postcss-processor`](https://jsr.io/@ecopages/postcss-processor) package.
Please use the processor directly in your `eco.config.ts`.

A Bun plugin that processes `.css` files

## Install

```bash
bunx jsr add @ecopages/bun-postcss-loader
```

## Usage

Just add this plugin to your bunfig.toml file and it will permits you to import postcss files as a normal css string.

```toml
preload = ["@ecopages/bun-postcss-loader"]
```
