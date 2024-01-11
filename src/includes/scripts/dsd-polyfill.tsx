import { Html } from "@elysiajs/html";

const dsdPolyfillFile = Bun.file('./public/js/scripts/dsd-polyfill.js');
const dsdPolyfillScript = await dsdPolyfillFile.text();

export function DsdPolyfillScript() {
  return <>
    <script type="module">{dsdPolyfillScript}</script>
    <noscript>
      <style>
        {`body[dsd-pending] {
        display: block !important;
      }`}
      </style>
    </noscript>
  </>
}