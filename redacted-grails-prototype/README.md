# redacted GRAILS prototype — extracted 2026-06-11

The working prototype of the narrative-collaborator engine, lifted out of redacted
(now dashboard-only). GRAILS = instance #1 script. This prototype predates the
designed architecture in `../WROOM_PIPELINE.md` — fold it in next.

- `public/` — UI (collab, character sheet, series overview, wroom mockup) + grails-beats.json + fountain/ scripts
- `server-grails-extract.js` — the server-side endpoints + table schemas (archival snippets from redacted's server.js)
- `_helpers.js` — redacted helpers incl. detectCharacterPopulateIntent (character-populate intent detection)
- `data-grails.sql` — 6 characters + 27 beats (the GRAILS instance-#1 data from redacted.db)
