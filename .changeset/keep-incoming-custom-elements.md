---
'@ecopages/browser-router': patch
---

Keep the incoming custom elements during a body swap. The router used to rebuild an added or replaced custom element from its markup, which dropped properties set on it in an `eco:before-swap` listener and replaced its nested custom elements. It now inserts the parsed element itself, so `event.detail.newDocument.querySelector('my-host').engine = engine` reaches the connected host. Elements the swap keeps in place still ignore incoming properties. A property set before an element upgrades shadows a class accessor of the same name and is reset by a class field of that name.
