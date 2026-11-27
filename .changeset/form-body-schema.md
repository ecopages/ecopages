---
'@ecopages/core': minor
---

Validate HTML form posts with `schema.body`. A route that declares `schema.body` now parses `application/x-www-form-urlencoded` and `multipart/form-data` bodies into a plain object before validation, so one schema serves a JSON client and a `<form method="post">` that works without JavaScript. A repeated key becomes an array, a multipart file stays a `File`, and values are strings, so coerce numbers in the schema. These content types used to answer HTTP 415; a malformed multipart body answers HTTP 400.
