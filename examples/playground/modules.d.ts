import '@ecopages/core/src/declarations';
import '@ecopages/core/src/env';
import type Alpine from 'alpinejs';

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}
