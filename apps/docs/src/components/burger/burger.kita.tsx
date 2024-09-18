import type { EcoComponent } from '@ecopages/core';

export const Burger: EcoComponent<{ class?: string }> = ({ class: className }) => {
  return (
    <radiant-burger class={className}>
      <button type="button" class="burger" aria-label="Toggle Navigation">
        <span class="burger__line"></span>
        <span class="burger__line"></span>
        <span class="burger__line"></span>
      </button>
    </radiant-burger>
  );
};

Burger.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./burger.css'],
    scripts: ['./burger.script.ts'],
  },
};
