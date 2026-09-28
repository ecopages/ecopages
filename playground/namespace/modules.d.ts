import '@ecopages/core/declarations';
import '@ecopages/core/env';

type Alpine = typeof import('alpinejs').default;

interface Window {
	Alpine: Alpine;
}
