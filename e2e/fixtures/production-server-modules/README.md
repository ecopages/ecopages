# Production server modules fixture

Acceptance app for `ecopages build` emitting every server entry into `dist/.server/` and production startup importing that map without compiling. The source-free deployment test starts through a host `server.js` wrapper that imports `dist/.server/app.mjs`, then checks that a missing route list is rejected.

Each Integration (KitaJS, React, Lit, Ecopages JSX, HTML Pages) has a static Page, a dynamic Page where the Integration accepts params, a Layout, an Endpoint, and an `app.static` view. The app also has an Html shell, a `404.html` error page, and SSR scripts for Lit and Radiant custom elements. The Lit Page imports its own SSR script, and a Radiant probe imports the Lit Page, Layout and script: the build must evaluate the Lit Layout and script once in the same production process, and the JSX Page must render the Radiant element with the Lit element defined in the same process.
