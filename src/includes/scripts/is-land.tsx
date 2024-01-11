import { Html } from "@elysiajs/html";

const isLandFile = Bun.file('./public/js/scripts/is-land.js');
const isLandScript = await isLandFile.text();

export function IsLandScript() {
  return <script type="module">{isLandScript}</script>
}