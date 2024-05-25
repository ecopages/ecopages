import { afterAll } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

afterAll(() => {
  GlobalRegistrator.unregister();
});
