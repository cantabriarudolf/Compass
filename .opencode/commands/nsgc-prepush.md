---
description: "Validate NSGC documentation (mocks, manuals, avances) before pushing to GitHub"
---

Run the **NSGC Pre-Push Validation** skill: analyze the current change and verify that mock documentation, module manuals, and development avances are in sync before pushing.

Load and follow the skill `nsgc-prepush` (`.agents/skills/nsgc-prepush/SKILL.md`):

1. Determine the scope of the change (`git status`, `git diff`, `git log origin/main..HEAD`).
2. Detect which areas changed (data mocks / module code).
3. Validate or fill: Mock Documentation Norm, module manual, development avance.
4. Update Trazabilidad and index if needed.
5. Report the validation checklist.

Do not commit or push until the checklist is complete or the user explicitly waives items.
