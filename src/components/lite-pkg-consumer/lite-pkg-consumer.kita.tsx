import { DepsManager } from "@eco-pages/core";
import type { LitePkgContext } from "../lite-pkg-context";

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
      <form class="grid gap-2">
        <div class="flex flex-col gap-1">
          <label for="input-key" class="font-bold text-sm">
            Key
          </label>
          <select data-options class="h-10 px-2 py-1 max-w-min border border-gray-700 rounded-md">
            <option value="name">name</option>
            <option value="version">version</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="input-value" class="font-bold text-sm">
            Value
          </label>
          <input
            data-input
            id="input-value"
            class="h-10 px-2 py-1 max-w-min border border-gray-700 rounded-md"
          />
        </div>
        <button
          data-button
          class="h-10 px-2 py-1 max-w-min border bg-gray-700 text-white rounded-md"
        >
          Update
        </button>
      </form>
    </lite-pkg-consumer>
  );
}

LitePkgConsumer.dependencies = DepsManager.collect({ importMeta: import.meta });
