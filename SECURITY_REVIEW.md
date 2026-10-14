# Security review

Review date: 14 October 2026. Scope: the original local `main.js` and `manifest.json`, followed by the revised source. The user's `data.json` was not read or included in the deliverables. Tests use mocked API responses and no real API key.

## Original deletion claim

I disagree with the claim that the original code can only delete an attachment created by this plugin.

The original code has one DELETE request. It checks for `linked_url`, which protects PDF and file attachments under normal API responses. However, `findAttachment` falls back to matching a URL when no attachment key is stored. Startup backfill adds entries without attachment keys. The attach command also stores the key of an existing URL match without any creation evidence. Either path can make an attachment created manually or by another tool a deletion target.

The original behavior therefore limits deletion to a matching linked URL attachment, but cannot establish its creator. Deletion is enabled by default, which makes this gap consequential. The old UI statement that it deletes only its own link is stronger than the implementation supports.

## Revised deletion guarantee

The revised source has one DELETE request, in `onDelete`. It requires deletion to be enabled, credentials to be available, dry run to be off, and the plugin to remain active. When confirmation is enabled, it waits for explicit approval and then fetches the attachment again.

`findAttachment` only fetches the stored creation key for entries marked `createdByPlugin: true`. It verifies the returned key, rejects a key equal to the parent key, verifies `itemType: attachment`, verifies `linkMode: linked_url`, verifies the recorded parent, checks for an Obsidian open URL and requires an integer item version. The DELETE uses that item version as `If-Unmodified-Since-Version`. There is no URL fallback for deletion.

The ownership flag is only assigned by this implementation after a successful POST returns a creation key. Existing matches are recorded as unowned, and older entries without this evidence stay unowned. URL update operations use the same ownership and type checks. Subject to intact local bookkeeping and trustworthy Zotero responses, the sole deletion path can remove only the recorded linked URL attachment created by this implementation. It cannot target the parent item, PDFs, snapshots, Zotero notes, stored files, linked files or unowned URL attachments.

Local bookkeeping is not cryptographic attestation. Malicious modification of `data.json`, another plugin with vault access, or running the original version alongside the revised version can invalidate that protection.

## Remaining risks

1. Credentials are stored unencrypted. The password input only masks display, and vault synchronization or backups can copy the file elsewhere. The README explains this, and `.gitignore` excludes the file. An already committed secret still requires revocation and removal from public history.
2. Zotero API deletion permanently removes the attachment. A user who enables deletion and approves it cannot restore that attachment through the plugin. Keep deletion disabled when this behavior is unwanted. The version precondition protects against a change between inspection and deletion, as documented in [Zotero write requests](https://www.zotero.org/support/dev/web_api/v3/write_requests).
3. Linked URLs reveal vault names and note paths to Zotero and authorized group members. They can also fail on devices with different vault names.
4. A failed or canceled deletion leaves a remote orphan and removes local tracking. There is no automatic deletion retry. This avoids a delayed destructive request, but cleanup may be manual.
5. A successful POST followed by a network interruption or local persistence failure can leave an attachment without ownership tracking. Multiple instances can also create duplicate links. They remain safe from automatic deletion if ownership cannot be established.
6. Renames while offline do not retry automatically. Tracking keeps the attachment key so the attach command can repair an owned URL later. Changes while the plugin is disabled are not reconciled at startup.
7. Bulk folder deletes have not been tested with actual Obsidian events. Only file delete events can enter deletion logic. Nested folder moves have mocked coverage and still need actual application testing.
8. Templates do not escape YAML or Markdown metadata. File name collisions can still occur, but the revised code refuses to attach an unrelated existing note and never overwrites its contents.
9. A setting change or plugin unload cannot recall an API request already sent. New queued writes are blocked after unload, and deletion checks the toggles again immediately before sending.

## Implemented safeguards

1. Deletion off by default for new installs.
2. Confirmation on by default, with cancellation that preserves the remote attachment.
3. Dry run at both operation level and API write boundary.
4. Creation provenance and exact attachment key checks with no deletion URL fallback.
5. Parent, type, link mode and version checks before remote changes.
6. Serialized operations, captured event paths and serialized local saves.
7. No raw request errors or Zotero response messages logged or displayed, reducing the chance of leaking credentials through diagnostic output.
8. Restricted API paths and use of authentication headers rather than URL query parameters.

## Verification

The automated suite tests ownership migration, safe deletion eligibility, protected item types, confirmation, cancellation, toggles, dry run, successful and ambiguous creation responses, existing attachments, offline recovery, pagination, folder moves, rapid events, file collisions, failed parent lookup and unload. It does not connect to Zotero or establish app compatibility. See [SUBMISSION.md](SUBMISSION.md) for the live checks still needed.
