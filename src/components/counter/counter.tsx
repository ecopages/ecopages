export function Counter() {
  return (
    <div class="counter" x-data="counter">
      <button aria-label="Decrement" class="counter__decrement" {...{ ["@click"]: "decrement" }}>
        -
      </button>
      <span x-text="count"></span>
      <button aria-label="Increment" class="counter__increment" {...{ ["@click"]: "increment" }}>
        +
      </button>
    </div>
  );
}

Counter.stylesheet = "counter.css";
Counter.script = "components/counter/counter.script";
