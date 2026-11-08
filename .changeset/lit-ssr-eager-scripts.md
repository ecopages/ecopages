---
'@ecopages/core': minor
'@ecopages/lit': patch
---

Lit now server-renders a custom element whose `ssr: true` script is not lazy, as the docs describe: `{ src: './counter.script.ts', ssr: true }` preloads the script on the server before render, so the element ships with its declarative shadow root on a Lit Page and inside any other Integration. Before, only lazy `ssr: true` scripts were preloaded and the element reached the HTML empty.

Breaking: `CustomElementScriptPreloader` from `@ecopages/core/integration` no longer takes `requireLazyScriptEntry`, and `collectCustomElementSsrPreloadScripts` drops that parameter, so `collectForIntegration` is now its third argument. Remove the option; every `ssr: true` entry is preloaded, eager or lazy.
