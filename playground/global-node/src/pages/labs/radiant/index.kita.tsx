import { eco } from '@ecopages/core';
import { RadiantTodoApp } from '@/components/radiant-todo-app';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout, RadiantTodoApp],
	},

	render: async () => {
		return (
			<BaseLayout>
				<RadiantTodoApp />
			</BaseLayout>
		);
	},
});
