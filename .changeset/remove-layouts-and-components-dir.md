---
'@ecopages/core': minor
---

Remove the `layoutsDir` and `componentsDir` config options, and find Layouts, Pages and explicit views from what references them instead of from a folder. A Layout is what a Page passes as `eco.page({ layout })`, and a view is a file the server entry imports; the folder names carried no meaning in the docs, yet three places read them.

- Production server modules: a Layout is an entry when a Page, view or error page passes it as `eco.page({ layout })`, wherever it lives. A file in `src/layouts` that no Page references is no longer an entry. Core reads the literal `eco.page({ layout })` call and the static import that binds the Layout, so a Layout passed through a variable or declared in a package is not found by it and is still bundled with the Page that imports it.
- Development HMR: React and Ecopages JSX ask the Route Registry whether a changed file is a Page, and whether a rendered Page referenced it as a Layout. A Layout outside `src/layouts` now takes the layout update path, and a helper inside it does not. A Layout no Page has rendered yet takes the component path until one does.
- Explicit views: saving a file the server entry imports for `ctx.render()`, `ctx.renderPartial()` or `app.static()` takes the server re-render path in any folder, and a file in `src/views` the server entry does not import no longer does.
- React no longer guesses which folder holds a config's relative script paths; a config the build did not stamp with an identity binds to its page.
- The project watcher watches `srcDir`, as it did, and no longer lists the two folders.

A repository lint rule (`ecopages-roles/no-folder-role-check`) fails on a `pages`, `layouts`, `components` or `views` path segment in package sources outside the router's `pages-dir.ts` and the file role module, so the folder checks cannot return.

Breaking: a config that sets `layoutsDir` or `componentsDir` fails when it loads, naming the option, and fails type checking. `absolutePaths.layoutsDir`, `absolutePaths.componentsDir`, `config.layoutsDir`, `config.componentsDir` and `getLayoutsDir()` and `getPagesDir()` on the HMR context are gone; the HMR context has `isPageFile(filePath)` and `isLayoutFile(filePath)` instead. `src/layouts` and `src/components` stay as conventions, and any folder works.

Migration:

1. Find the options: search your `eco.config.ts` (and any file that builds the config) for `layoutsDir` and `componentsDir`. Search the rest of the project, plugins included, for `absolutePaths.layoutsDir`, `absolutePaths.componentsDir`, `getLayoutsDir` and `getPagesDir`.
2. Delete both options from the config. A project that used the defaults needs nothing else. A project that set a custom folder keeps its files where they are: nothing reads the folder name any more, so no file has to move.
3. Replace each plugin use: for "is this file a Page", ask `isPageFile(filePath)` on the HMR context; for "is this a Layout", ask `isLayoutFile(filePath)`. For a path inside your own source tree, join `absolutePaths.srcDir` with the folder you mean.
4. Make sure every Layout is passed literally: a Layout reaches the production server modules through `eco.page({ layout: MyLayout })` or `eco.page({ layout: [Outer, Inner] })` in the Page file, with `MyLayout` bound by a static `import`. A Layout chosen through a variable or a wrapper still renders, but is not a separate server module.
5. Verify: run `ecopages build` and `ecopages dev`. The config loads without the removed-option error, `dist/server/server-modules.json` lists the Layouts your Pages use, and editing a Layout in `ecopages dev` refreshes the open page without a restart.
