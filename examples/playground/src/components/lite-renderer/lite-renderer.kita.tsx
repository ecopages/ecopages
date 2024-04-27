import { DepsManager, type EcoComponent } from '@eco-pages/core';
import type { LiteRendererProps } from './lite-renderer.script';

const Controls = () => {
  return (
    <div class="lite-renderer-controls">
      <button type="button" data-add>
        Say Hello
      </button>
      <button type="button" data-reset>
        Reset
      </button>
    </div>
  );
};

export const LiteRenderer: EcoComponent<
  LiteRendererProps & {
    children?: JSX.Element;
  }
> = ({ children, text = 'Hello from Lite', ...props }) => {
  return (
    <lite-renderer class="lite-renderer" text={text} replace-on-load={props['replace-on-load']}>
      <Controls />
      <div data-list>{children as 'safe'}</div>
      <p class="small-print">
        *The first message has been rendered on the {props['replace-on-load'] ? 'client' : 'server'}
      </p>
    </lite-renderer>
  );
};

LiteRenderer.dependencies = DepsManager.collect({ importMeta: import.meta });
