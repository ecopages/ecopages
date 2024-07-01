import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage } from '@ecopages/core';

const EventsPage: EcoPage = () => {
  return (
    <BaseLayout>
      <lite-event-listener class="grid gap-3 max-w-fit">
        <div class="bg-gray-100 text-black p-3" data-ref="event-detail">
          Click to change the text
        </div>
        <lite-event-emitter>
          <button class="bg-blue-700 text-white px-2 py-1 rounded-md" type="button" data-ref="emit-button">
            Emit Event
          </button>
        </lite-event-emitter>
      </lite-event-listener>
    </BaseLayout>
  );
};

EventsPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
    scripts: ['./lite-event.script.ts'],
  },
};

export default EventsPage;
