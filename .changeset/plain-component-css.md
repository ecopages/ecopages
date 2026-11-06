---
'@ecopages/core': minor
---

Deliver the CSS of plain function components. Discovery now follows a declaration's static imports through plain local modules, stopping at Eco modules, packages and `.server` modules, and hands their side-effect CSS to the nearest `eco.page()`, `eco.layout()`, `eco.html()` or `eco.component()` that imports them. The stylesheet is linked once, after the CSS of every declaration importing it, so CSS under a persisted layout stays with it across navigation. Eco Components a plain module imports become Components of that declaration, and editing a plain module's imports in development refreshes the Page's stylesheets.

The build removes those imports from every plain module, so development, production, server and browser builds treat them alike: no more dropped stylesheets on the server, CSS shipped as an unused string with the PostCSS Processor, or a production browser build failing without one.

Breaking: these CSS imports now fail the build in development and in `ecopages build`, naming the file and the import:

- a side-effect CSS import in a plain module inside the app that no declaration reaches (for example one imported only through `export *`, a namespace import, or a client script);
- a CSS Module or a package stylesheet, in a module an Integration owns or discovery reaches.

Rendering a plain component owned by another Integration that compiles JSX differently (a plain React component in a Kita Page) also fails the build, naming the component and both Integrations; wrap it in `eco.component()` to render it as a Foreign Child.

`EcoBuildPluginBuilder` gains `onEnd(callback)`, which runs once every module of a build is transformed; a custom builder implementation must provide it.
