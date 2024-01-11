import { Html } from "@elysiajs/html";

const litHydrateSupportFile = Bun.file('./public/js/scripts/lit-hydrate-support.js');
const litHydrateSupportScript = await litHydrateSupportFile.text();

export function LitHydrateSupportScript() {
  return <script type="module">{litHydrateSupportScript}</script>
}