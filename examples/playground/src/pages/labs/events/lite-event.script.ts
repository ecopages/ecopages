import { type EventEmitter, RadiantElement, customElement, event, onEvent, query } from '@ecopages/radiant';

enum LiteEventEvents {
  CustomEvent = 'custom-event',
}

type LiteEventDetail = {
  value: string;
};

@customElement('lite-event-emitter')
export class LiteEventEmitter extends RadiantElement {
  @event({ name: LiteEventEvents.CustomEvent, bubbles: true, composed: true })
  customEvent!: EventEmitter<LiteEventDetail>;

  @onEvent({ ref: 'emit-button', type: 'click' })
  onEmitButtonClick() {
    this.customEvent.emit({ value: `Hello World ${new Date().toISOString()}` });
  }
}

@customElement('lite-event-listener')
export class LiteEventListener extends RadiantElement {
  @query({ ref: 'event-detail' }) eventDetail!: HTMLDivElement;

  @onEvent({ selector: 'lite-event-emitter', type: LiteEventEvents.CustomEvent })
  onCustomEvent(event: CustomEvent<LiteEventDetail>) {
    this.eventDetail.textContent = event.detail.value;
  }
}

(document.querySelector('lite-event-listener') as LiteEventEmitter).addEventListener(
  LiteEventEvents.CustomEvent,
  (event: CustomEvent<LiteEventDetail>) => {
    console.log('External Listener:', event.detail.value);
  },
);

declare global {
  interface HTMLElementEventMap {
    [LiteEventEvents.CustomEvent]: CustomEvent<LiteEventDetail>;
  }

  namespace JSX {
    interface IntrinsicElements {
      'lite-event-emitter': HtmlTag;
      'lite-event-listener': HtmlTag;
    }
  }
}
