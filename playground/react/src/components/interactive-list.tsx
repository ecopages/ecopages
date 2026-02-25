import { useState } from 'react';

export function InteractiveList({ initialData }: { initialData: string[] }) {
	const [count, setCount] = useState(0);
	return (
		<div className="p-4 border rounded">
			<button onClick={() => setCount((c) => c + 1)} className="bg-blue-500 text-white px-2 py-1 rounded mb-4">
				Clicks: {count}
			</button>
			<ul className="list-disc pl-5">
				{initialData.map((item, i) => (
					<li key={i}>{item}</li>
				))}
			</ul>
		</div>
	);
}
