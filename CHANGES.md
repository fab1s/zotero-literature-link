# Changes in 0.4.0

1. Renamed the plugin to Zotero Literature Link with ID `zotero-literature-link`, updated the description and contributor attribution, and added `versions.json`.
2. Changed new installation defaults to the vault root, `{{title}} ({{itemKey}})`, and a heading with a Zotero link. Existing saved templates and folders are preserved.
3. Added guessed, item key and Extra citation key sources, with an item key fallback for missing Extra values. Guessing now prefers the first author before other creator types. Added `{{itemKey}}` to templates and documented Better BibTeX limitations.
4. Added creation ownership tracking. Legacy entries and existing attachment matches remain unowned. Removed automatic startup backfill and all automatic remote mutation based only on URL matches.
5. Changed new installation deletion defaults to off, added confirmation enabled by default, and added dry run for all Zotero writes. Existing saved deletion preferences are preserved.
6. Added exact attachment key, distinct parent key, item type, link mode, parent, URL and version checks before deletion or URL updates. Kept Zotero version preconditions.
7. Serialized commands and vault event operations, captured paths when events arrive, serialized settings saves, and added unload guards with confirmation cleanup. Folder moves update tracked descendants, and tracked files remain eligible for synchronization after an extension change.
8. Added explicit repair of an owned attachment through the attach command after an offline rename. Added pagination when checking for existing linked attachments, reducing duplicate creation in items with many attachments.
9. Added API path validation and numeric user ID validation. Replaced `crypto.randomUUID` with browser `getRandomValues`, retaining a random write token while avoiding reliance on that particular method.
10. Made failed parent lookup stop note creation, rejected standalone Zotero attachments and notes, rejected empty file names and dot segments, refused unrelated existing note collisions, and recorded newly created note targets even when attachment creation is disabled.
11. Required a valid returned creation key before marking an attachment owned and accepted both documented creation response shapes. Removed raw error objects and remote error message display to reduce accidental secret disclosure.
12. Moved input styling into scoped `styles.css` classes and added settings sections for connection, notes and safety.
13. Added a README, code security review and current official Community submission checklist, including installation, migration, privacy, permanent deletion, sync limitations and troubleshooting. Added a walkthrough based on the supplied screenshots explaining the prompt, the generated note, and the link attachment in Zotero, with custom templates distinguished from new installation defaults.
14. Added MIT licensing, secret and dependency exclusions, dependency free build scripts, package metadata, a lock file, mocked regression tests and a GitHub release workflow. Editable source now lives in `src/main.js`; generated `main.js` remains a complete installable file and is excluded from Git.

The source and release assets are published at [fab1s/zotero-literature-link](https://github.com/fab1s/zotero-literature-link). BRAT installation still needs application testing, and no official Community submission has been made. No real Zotero writes or deletions were performed during preparation or publication.
