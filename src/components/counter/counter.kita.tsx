import type { EcoComponent } from "@/types";
import { getComponentDependencies } from "root/lib/component-utils/get-component-config";

export type CounterProps = {
  count?: number;
};

export const Counter: EcoComponent<CounterProps> = ({ count = 0 }) => {
  return (
    <div class="counter" x-data="counter">
      <button aria-label="Decrement" class="counter__decrement" {...{ ["@click"]: "decrement" }}>
        -
      </button>
      <span x-text="count">{count}</span>
      <button aria-label="Increment" class="counter__increment" {...{ ["@click"]: "increment" }}>
        +
      </button>
    </div>
  );
};

Counter.dependencies = getComponentDependencies({ importMeta: import.meta });
