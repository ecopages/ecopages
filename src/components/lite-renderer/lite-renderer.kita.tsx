import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { type LiteRendererProps } from "./lite-renderer.script";
import { Message } from "./lite-renderer.templates.kita";

const Controls = () => {
  return (
    <div class="flex gap-4 justify-between">
      <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" data-add>
        Say Hello
      </button>
      <button class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded" data-reset>
        Reset
      </button>
    </div>
  );
};

export const LiteRendererServer: EcoComponent<LiteRendererProps> = ({
  text = "Hello from lite",
}) => {
  return (
    <lite-renderer class="grid gap-2 max-w-2xl bg-slate-200 rounded-md px-2 pt-3 pb-2">
      <Controls />
      <div class="grid gap-2 h-40 overflow-auto bg-slate-50 p-4 rounded-md" data-list>
        <Message text={text} />
      </div>
      <p class="text-xs">*The first message has been sent via the server</p>
    </lite-renderer>
  );
};

export const LiteRendererClient: EcoComponent<LiteRendererProps> = ({
  text = "Hello from lite",
}) => {
  return (
    <lite-renderer class="grid gap-2 max-w-2xl bg-slate-200 rounded-md px-2 pt-3 pb-2" text={text}>
      <Controls />
      <div class="grid gap-2 h-40 overflow-auto bg-slate-50 p-4 rounded-md" data-list></div>
      <p class="text-xs">*The first message has been rendered on the client</p>
    </lite-renderer>
  );
};

LiteRendererServer.dependencies = DepsManager.collect({ importMeta: import.meta });

LiteRendererClient.dependencies = DepsManager.collect({ importMeta: import.meta });
