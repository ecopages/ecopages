import { DepsManager, type EcoComponent } from "@eco-pages/core";
import type { EcoCounterProps } from "./eco-counter.script";

export const EcoCounter: EcoComponent<EcoCounterProps> = ({ count }) => {
  return (
    <eco-counter class="eco-counter" count={count}>
      <button data-decrement aria-label="Decrement" class="eco-counter__decrement">
        -
      </button>
      <span data-text="count">{count}</span>
      <button data-increment aria-label="Increment" class="eco-counter__increment">
        +
      </button>
    </eco-counter>
  );
};

EcoCounter.dependencies = DepsManager.collect({ importMeta: import.meta });
