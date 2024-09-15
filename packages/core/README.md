# Ecopages

Ecopages is a static site generator designed with the goal of simplifying the process of creating websites. It is suitable for a range of projects, from blogs to portfolios, emphasizing ease of use and flexibility.

This project is built on a commitment to clarity and simplicity in web development, utilizing modern web technologies without obscuring the process with unnecessary complexity.

Ecopages relies on a minimal set of dependencies, carefully chosen to support its core functionality.

Ecopages is built on the [Bun](https://bun.sh/) runtime, primarily utilizing [Kita](https://kita.js.org/) and [Mdx](https://mdxjs.com/) for rendering. Additionally, it supports [Lit Elements](https://lit.dev/) and offers experimental integration with [React](https://react.dev/). This setup allows for the extension of the platform with custom rendering functions, providing flexibility to cater to the specific needs of each project. The integrations are designed to be extensible, with no limit to the customization and expansion possibilities.

For styling, [Tailwind CSS](https://tailwindcss.com/) and [PostCSS](https://postcss.org/) have been integrated. Notably, we recommend using `css` stylesheets and `@apply` directives with Tailwind CSS, diverging from its usual inline styling approach to better suit the structure of Ecopages.

As a project in its early stages, Ecopages is continuously evolving. Users may encounter limitations or areas in need of refinement. We welcome feedback and issue reports via our [GitHub repository](https://github.com/ecopages/ecopages).

## Install

```bash
bunx jsr add @ecopages/core
```
