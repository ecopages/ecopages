---
'@ecopages/core': patch
'@ecopages/react': patch
'@ecopages/react-router': patch
---

Fix a hydrated React Page or Island that renders a Component another Integration owns, such as a Lit Component imported into React MDX. React now keeps that Component's server HTML in an `<eco-foreign-subtree>` element instead of calling its `render` in the browser, which crashed hydration ("Objects are not valid as a React child"). A Lit element keeps its declarative shadow root and stays interactive, also after a React router navigation and an HMR update. React now wraps every Foreign Subtree it renders in the body in this `display:contents` element, so CSS that targets the foreign element as a direct child must account for it.
