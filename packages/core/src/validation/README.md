# Request Validation

**Layer:** Foundation.

This directory validates API request inputs against Standard Schema validators.

`validateRequest()` validates the declared params, query, headers, and body. Available validators run concurrently. A declared body validator always runs, including when the parsed body is `undefined`, so required schemas reject an empty body and optional schemas can accept it. `validateStandardSchema()` adapts Standard Schema results into the validation error used by the API request pipeline.

The API request pipeline owns parsing and response handling; this module owns schema execution and normalized validation errors.
