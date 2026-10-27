# Production server modules fixture

Acceptance app for `ecopages build` emitting every server entry into `dist/.server/` and `ecopages start` importing that map without compiling.

Each Integration (KitaJS, React, Lit, Ecopages JSX, HTML Pages) has a static Page, a dynamic Page where the Integration accepts params, a Layout, an Endpoint, and an `app.static` view. The app also has an Html shell, a `404.html` error page, and SSR scripts that render a Radiant custom element followed by a Lit custom element in the same production process.
