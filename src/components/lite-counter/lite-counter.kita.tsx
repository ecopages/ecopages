import { DepsManager, type EcoComponent } from "@eco-pages/core";
import type { LiteCounterProps } from "./lite-counter.script";

export const LiteCounter: EcoComponent<LiteCounterProps> = ({ count }) => {
  return (
    <lite-counter class="lite-counter" count={count}>
      <button data-decrement aria-label="Decrement" class="lite-counter__decrement">
        -
      </button>
      <span data-text="count">{count}</span>
      <button data-increment aria-label="Increment" class="lite-counter__increment">
        +
      </button>
    </lite-counter>
  );
};

LiteCounter.dependencies = DepsManager.import({
  importMeta: import.meta,
  scripts: ["./lite-counter.script.ts"],
  stylesheets: ["./lite-counter.css"],
});
