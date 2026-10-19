---
'@ecopages/react-router': patch
---

When a destination page fails to load, for example a chunk that no longer exists after a deploy, the router now performs a normal page load of that URL instead of leaving the link dead. The error is still logged to the console.
