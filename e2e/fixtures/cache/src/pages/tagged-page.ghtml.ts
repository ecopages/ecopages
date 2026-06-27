import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export default eco.page({
	cache: {
		revalidate: 60,
		tags: ['content', 'tagged'],
	},
	render: () => {
		const timestamp = Date.now();
		return html`
			<html>
				<body>
					<h1>Tagged Page</h1>
					<div id="timestamp">${timestamp}</div>
					<p>This page is tagged with 'content' and 'tagged' for invalidation.</p>
				</body>
			</html>
		`;
	},
});
