import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { type LiteRendererProps } from "./lite-renderer.script";

export const LiteRenderer: EcoComponent<LiteRendererProps> = ({ text }) => {
  return (
    <lite-renderer class="grid gap-2 max-w-2xl bg-slate-200 rounded-md p-4" text={text}>
      <div class="flex gap-4 justify-between">
        <button
          class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          data-add
        >
          Say Hello
        </button>
        <button
          class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          data-reset
        >
          Reset
        </button>
      </div>
      <div class="grid gap-2 max-h-52 overflow-auto bg-slate-50 p-4" data-list></div>
    </lite-renderer>
  );
};

LiteRenderer.dependencies = DepsManager.collect({ importMeta: import.meta });
