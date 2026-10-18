window.$ = function (selector) {
	var element = document.querySelector(selector);
	return {
		addClass: function (name) {
			element.classList.add(name);
		},
	};
};
