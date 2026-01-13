import { register } from '@/lib/alpine/register';

function counterController() {
	return {
		count: 0,
		increment() {
			this.count++;
		},
		decrement() {
			this.count = this.count > 0 ? this.count - 1 : this.count;
		},
	};
}

register('counter', counterController);
