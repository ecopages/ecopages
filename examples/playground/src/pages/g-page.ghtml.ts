import { LiteCounter } from '@/components/lite-counter';
import { type EcoComponent, resolveComponentsScripts } from '@ecopages/core';
import { html } from 'ghtml';

function getAsyncData(): Promise<{
  username: string;
  age: number;
}> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        username: 'John',
        age: 21,
      });
    }, 500);
  });
}

const AsyncComponent = async () => {
  const asyncElement = new Promise((resolve) => {
    setTimeout(() => {
      resolve(`${new Date().toLocaleTimeString()}`);
    }, 500);
  });

  return html`<p class="px-4 py-2 max-w-fit border-slate-500 border-2 bg-slate-200 font-mono text-slate-800 rounded-md"
    >!${await asyncElement}</p
  >`;
};

const GhtmlPage: EcoComponent = async () => {
  const data = await getAsyncData();

  return html`
    <main class="container p-4">
      <div class="flex flex-col gap-4">
        <p class="text-lg font-bold">Data:</p>
        <ul>
          !${Object.entries(data).map(([key, val]) => html`<li>${key}: ${val}</li>`)}
        </ul>
        <scripts-injector
          on:interaction="mouseenter,focusin"
          scripts="${resolveComponentsScripts([LiteCounter])}"
        >
          <lite-counter count="0">
            <button type="button" data-ref="decrement" aria-label="Decrement">-</button>
            <span data-ref="count">0</span>
            <button type="button" data-ref="increment" aria-label="Increment">+</button>
          </lite-counter>
        </scripts-injector>
        <p>!${await AsyncComponent()}</p>
      </div>
    </main>
  `;
};

GhtmlPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [LiteCounter],
  },
};

export default GhtmlPage;
