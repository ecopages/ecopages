import { describe, expect, test } from 'bun:test';
import { LiteElement } from '@/core/lite-element';
import { customElement } from '@/decorators/custom-element';
import { event } from '@/decorators/event';
import { onEvent } from '@/decorators/on-event';
import { query } from '@/decorators/query';
import type { EventEmitter } from '@/tools/event-emitter';

enum LiteEventEvents {
  CustomEvent = 'custom-event',
}

type LiteEventDetail = {
  value: string;
};

@customElement('lite-event-emitter')
class LiteEventEmitter extends LiteElement {
  @event({ name: LiteEventEvents.CustomEvent, bubbles: true, composed: true })
  customEvent!: EventEmitter<LiteEventDetail>;

  @onEvent({ ref: 'emit-button', type: 'click' })
  onEmitButtonClick() {
    this.customEvent.emit({ value: 'Hello, World!' });
  }
}

@customElement('lite-event-listener')
class LiteEventListener extends LiteElement {
  @query({ ref: 'event-detail' }) eventDetail!: HTMLDivElement;

  @onEvent({ selector: 'lite-event-emitter', type: LiteEventEvents.CustomEvent })
  onCustomEvent(event: CustomEvent<LiteEventDetail>) {
    this.eventDetail.textContent = event.detail.value;
  }
}

const template = `
<lite-event-listener>
  <div data-ref="event-detail">Click to change the text</div>
  <lite-event-emitter></lite-event-emitter>
</lite-event-listener>`;

describe('@event', () => {
  test('decorator emits and listens to custom event correctly', () => {
    document.body.innerHTML = template;
    const litEventListener = document.querySelector('lite-event-listener') as LiteEventListener;
    const litEventEmitter = document.querySelector('lite-event-emitter') as LiteEventEmitter;
    expect(litEventListener.eventDetail.innerHTML).toEqual('Click to change the text');
    litEventEmitter.customEvent.emit({ value: 'Hello, World!' });
    expect(litEventListener.eventDetail.innerHTML).toEqual('Hello, World!');
  });
});
