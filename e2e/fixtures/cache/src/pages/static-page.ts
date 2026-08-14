import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'static',
	render: () => {
		const timestamp = Date.now();
		return `
			<html>
				<body>
					<h1>Static Page</h1>
					<div id="timestamp">${timestamp}</div>
					<p>This page is cached indefinitely.</p>
				</body>
			</html>
		`;
	},
});
