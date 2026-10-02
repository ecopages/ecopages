# Ecopages HTML Pages template

An Ecopages app built from plain HTML Pages, with Tailwind v4, client navigation, and custom elements for small interactive islands.

## Getting started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/pages` — Filesystem Routes as `.html` files, including `404.html` and `500.html`
- `src/includes/html.html` — HTML shell; Page content renders at `<!-- eco:children -->`
- `src/components` — custom elements and their stylesheets
- `src/styles` — Tailwind theme
- `src/public` — favicons and other files served as written
- `.agents/skills` — agent skill packs for this app

Start customization in `src/pages/index.html` and `src/includes/html.html`. A Page's `<title>` and description replace the shell's, and local stylesheets and scripts resolve against the file that references them. Interactive islands are standard custom elements: a Page references the module that defines them.

Open Graph and Twitter tags are written by hand, as in any HTML site. The shell holds the site defaults, and a Page that sets its own title or description repeats it in `og:title`, `og:description`, `twitter:title`, and `twitter:description`; each one replaces the shell tag with the same `property` or `name`.

## Agent skills

[AGENTS.md](./AGENTS.md). Packs in this template:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [HTML Pages](https://ecopages.app/docs/core/pages#html-pages)
- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)

## Build

```bash
bun run build
bun preview
```
