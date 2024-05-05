import type { EcoComponent } from '@eco-pages/core';
import { useState } from 'react';

type CounterProps = {
  defaultValue: number;
};

export const Counter: EcoComponent<CounterProps> = ({ defaultValue = 5 }) => {
  const [count, setCount] = useState(defaultValue);

  return (
    <div className="counter-react">
      <button onClick={() => setCount(count - 1)} aria-label="Decrement" type="button" className="decrement">
        -
      </button>
      <span>{count}</span>
      <button
        data-increment
        onClick={() => setCount(count + 1)}
        aria-label="Increment"
        type="button"
        className="increment"
      >
        +
      </button>
    </div>
  );
};

Counter.dependencies = {
  stylesheets: ['components/counter/counter.css'],
};
