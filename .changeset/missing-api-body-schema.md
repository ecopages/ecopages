---
'@ecopages/core': minor
---

**Breaking:** A declared API body schema now validates `undefined` when the request has no body and no `Content-Type`, or when a supported JSON or plain text body is empty. Required schemas answer HTTP 400; mark a schema optional, such as with `.optional()`, when the route accepts a missing body. Unsupported content types and nonempty bodies without a `Content-Type` answer HTTP 415.
