# Multi-platform verification notes

- FastAPI `/search` smoke test with `platforms=["ao3", "lofter"]` returned `source=live`, 20 verified AO3 items, `totalWorks=10480`, `totalPages=524`, and a platform-level warning for Lofter HTTP 404 plus AO3 page 2 HTTP 525. The successful AO3 results were preserved while failed Lofter did not block the response.
- The browser preview displayed the FILTERS control. After opening it, both semantic checkboxes appeared: AO3 and LOFTER, each with a checked state and platform-specific visual treatment.
- Python tests: 4 passed. Frontend tests: 14 passed. TypeScript and production build passed before this verification.

- Browser interaction confirmed that unchecking LOFTER changes the adapter summary from `AO3 + LOFTER` to `AO3`. Entering `月光` and submitting then changed the page to `FILTERS SCANNING` / `SCANNING ARCHIVES...`, confirming the selected-platform search path was invoked.
