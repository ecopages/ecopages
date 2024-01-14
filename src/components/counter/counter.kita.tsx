export function Counter() {
  return (
    <div class="counter" x-data="counter">
      <button aria-label="Decrement" class="counter__decrement" {...{ ["@click"]: "decrement" }}>
        -
      </button>
      <span x-text="count">0</span>
      <button aria-label="Increment" class="counter__increment" {...{ ["@click"]: "increment" }}>
        +
      </button>
    </div>
  );
}

Counter.stylesheet = "counter.styles.css";
Counter.script = "components/counter/counter.script";
