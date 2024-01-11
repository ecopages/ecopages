window.onload = async () => {
  const { hydrateShadowRoots } = await import("./hydrate-shadow-roots");

  if (!HTMLTemplateElement.prototype.hasOwnProperty("shadowRoot")) {
    hydrateShadowRoots(document.body);
  }
  document.body.removeAttribute("dsd-pending");
};
