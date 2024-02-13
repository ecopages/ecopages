import { DepsManager } from "@eco-pages/core";

export function LitePkgConsumer({ contextId }: { contextId: string }) {
  return (
    <lite-pkg-consumer context-id={contextId} class="flex flex-col gap-2">
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
    </lite-pkg-consumer>
  );
}

LitePkgConsumer.dependencies = DepsManager.collect({ importMeta: import.meta });
