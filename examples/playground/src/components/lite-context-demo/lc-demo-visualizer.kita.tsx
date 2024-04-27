export function LiteContextDemoVisualizer() {
  return (
    <lc-demo-visualizer>
      <p class="lc-demo__label">lc-demo-visualizer</p>
      <h1 class="text-3xl font-bold space-x-2">
        <span data-name class="capitalize">
          eco-pages
        </span>
        <span data-version>0.1</span>
      </h1>
      <p class="font-bold">Template Support</p>
      <ul data-template-support class="list-disc ml-6">
        <li>kita</li>
      </ul>
      <p class="font-bold">Plugins</p>
      <ul data-plugins class="list-disc ml-6">
        <li>lit-light</li>
        <li>alpinejs</li>
        <li>lit-ssr</li>
      </ul>
    </lc-demo-visualizer>
  );
}
