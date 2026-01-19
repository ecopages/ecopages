import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export default eco.page({
	cache: {
		revalidate: 5,
		tags: ['revalidate-test'],
	},
	render: () => {
		const timestamp = Date.now();
		return html`
			<html>
				<body>
					<div id="timestamp">${timestamp}</div>
				</body>
			</html>
		`;
	},
});
