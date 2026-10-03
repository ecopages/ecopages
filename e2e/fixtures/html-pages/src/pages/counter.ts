class MyCounter extends HTMLElement {
	connectedCallback() {
		let count = Number(this.getAttribute('count') ?? '0');
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = `Count: ${count}`;
		button.addEventListener('click', () => {
			count += 1;
			button.textContent = `Count: ${count}`;
		});
		this.replaceChildren(button);
	}
}

customElements.define('my-counter', MyCounter);
