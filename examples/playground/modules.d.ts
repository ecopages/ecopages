import type Alpine from 'alpinejs';
import '@ecopages/core/src/declarations';

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}
