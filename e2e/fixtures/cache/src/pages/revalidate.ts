import { eco } from '@ecopages/core';

export default eco.page({
	cache: {
		revalidate: 2,
		tags: ['revalidate-test'],
	},
	render: () => {
		const timestamp = Date.now();
		return `
			<html>
				<body>
					<div id="timestamp">${timestamp}</div>
				</body>
			</html>
		`;
	},
});
