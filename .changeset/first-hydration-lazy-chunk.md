---
'@ecopages/react': minor
'@ecopages/react-router': minor
---

Document what a failed `React.lazy` chunk does during first hydration. React discards the Page unless a Page-level error boundary around the entry catches it. The router does not reload, because a reload there would loop for as long as the failure lasts.
