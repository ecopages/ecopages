---
'@ecopages/core': minor
'ecopages': minor
---

Import a view and pass it to `ctx.render`, `ctx.renderPartial`, `app.static`, and error pages. Development reloads an edited view and a component it imports without restarting the process. Production serves the built module and does not compile.

This is a breaking change: `ctx.renderServerModule`, `ctx.importServerModule` on the render context, string and URL view paths, and `createViewModuleLoader` are removed. Import the view instead of passing its path.
