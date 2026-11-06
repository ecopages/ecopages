import './card.css';

export type CardProps = {
	title: string;
	copy: string;
};

export function Card({ copy, title }: CardProps) {
	return (
		<article class="card">
			<h1>{title}</h1>
			<p>{copy}</p>
		</article>
	);
}
