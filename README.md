# Zotero Literature Link

Create literature notes from Zotero items and attach a link back to each note in Zotero. This is an independent Obsidian community plugin.

The command **Create literature note from Zotero link** opens a prompt and prefills it when the clipboard contains a recognized link. It fetches metadata from the Zotero web API, creates a Markdown note using your templates, opens it, and optionally creates a linked URL attachment on the Zotero parent item.

The command **Attach this note's link to its Zotero item** links an existing Markdown note. The plugin first uses its recorded target, then the configured frontmatter property, then the first `zotero://select` link in the note body. A frontmatter value can be a supported Zotero link or an eight character item key.

Renaming or moving a tracked note updates its owned link attachment when synchronization is enabled. Deleting a tracked note can permanently remove its owned attachment when deletion is enabled. Deletion is disabled by default for new installations, and confirmation is enabled by default.

## Example workflow

1. **Enter the Zotero link.** Run **Create literature note from Zotero link**, paste the item's `zotero://select` link into the prompt, and select **Create note**. If a recognized link is already on your clipboard, the prompt fills it in automatically.
2. **Start writing in the new note.** The plugin reads the item's synced metadata and opens a new literature note in Obsidian. Your folder and templates determine its file name and starting content. The example shows a citation key and title in the file name, the tags `#note/literature` and `#chapter`, a clickable **Zotero** link, and space for your own notes. Selecting that Zotero link opens the source item in the Zotero app. The plugin creates the note's starting structure; it does not write a summary or import the PDF.
3. **Open the note from Zotero.** When attachment creation is enabled and dry run is off, the plugin adds a linked URL attachment to the source item. After Zotero syncs, it appears alongside attachments such as the PDF. The example calls this attachment **Obsidian**, which is the default attachment title. Opening it launches Obsidian and opens the corresponding note. The PDF remains a separate attachment.

This example uses a custom folder and template setup. New installations use the neutral defaults described below. You can change the folder, file name, note template and attachment title in the plugin settings.

## Requirements

1. Obsidian 1.4.0 or later. This is the retained compatibility target and requires testing on actual devices before Community submission.
2. A Zotero account with library metadata synced to zotero.org. This plugin uses the remote API, so an item that exists only on your computer is unavailable.
3. A Zotero API key with read and write access to each library you use. Group libraries also require the appropriate group permissions.
4. Your numeric Zotero user ID, available at [Zotero API key settings](https://www.zotero.org/settings/keys). This is a number, not your username.
5. An internet connection for metadata requests and attachment operations.

PDF file syncing is not required for metadata lookup. Zotero must sync again to show newly created or changed attachments in its desktop app. [Zotero API documentation](https://www.zotero.org/support/dev/web_api/v3/basics) describes remote library access.

## Installation through BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Obsidian Community plugins.
2. Use this repository URL: [https://github.com/fab1s/zotero-literature-link](https://github.com/fab1s/zotero-literature-link).
3. In BRAT, use its command or settings control for adding a beta plugin and paste that repository URL.
4. Choose the latest release and add the plugin.
5. Enable Zotero Literature Link under **Settings > Community plugins**, then enter your credentials in its settings.

BRAT installation requires a published GitHub release with `main.js` and `manifest.json`. This project also supplies `styles.css`.

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub release. Download the individual assets rather than the automatically generated source archive.
2. Create a folder called `zotero-literature-link` inside your vault's configuration directory under `plugins`. With the standard configuration directory this is `.obsidian/plugins/zotero-literature-link`.
3. Copy those three files into that folder.
4. Reload Obsidian and enable Zotero Literature Link under **Settings > Community plugins**.
5. Open its settings and enter your numeric user ID and API key locally.

## Upgrading the original local plugin

Disable the original Zotero Obsidian Link before enabling this plugin. Back up your vault and the original plugin files privately. Install the new files into a folder matching the new manifest ID, `zotero-literature-link`.

To preserve your settings and tracking, copy your existing `data.json` privately into the new plugin folder while both plugins are disabled. Do not publish that file. Existing folder, template and synchronization choices are preserved. A previously enabled deletion setting stays enabled, but older attachments remain unowned and cannot be automatically deleted or updated by this release. Newly added citation handling defaults to guessing, so select **Citation Key: in Extra** if your previous notes relied on that field.

Do not run both versions together. The old version retains its original deletion behavior. The folder currently used for local development must also match the new manifest ID before normal use.

## Configuration and templates

Change **Folder**, **File name template**, and **Note template** in the plugin settings. The generic defaults create notes at the vault root, use `{{title}} ({{itemKey}})` as the file name, and create a heading followed by a Zotero link. A specified folder is created when needed.

Supported placeholders in either template are `{{citekey}}`, `{{itemKey}}`, `{{title}}`, `{{authors}}`, `{{year}}`, `{{publication}}`, `{{doi}}`, `{{itemType}}`, `{{typeTag}}`, and `{{zoteroLink}}`. Unknown placeholders expand to an empty string. Note contents are plain template substitution, without automatic YAML or Markdown escaping. If you add YAML, handle quotes and multiline metadata in your template yourself.

File names have unsupported characters removed, whitespace simplified, and a maximum length of 150 characters before `.md` is added. Empty names and dot segments are rejected. Different templates or long titles can still produce collisions. An existing note is only reused when its recorded target or Zotero link matches the requested item. Its contents are never overwritten.

Supported prompt inputs include `zotero://select/library/items/XXXXXXXX`, `zotero://select/groups/123/items/XXXXXXXX`, recognized Zotero web item links, and bare item keys. Personal library links and bare keys use your configured user ID. A prompt link to a child attachment or Zotero note resolves to its parent item. A standalone attachment or Zotero note is rejected.

## Citation keys

Select one of three sources for `{{citekey}}`:

1. **Guess from author and year** uses the first author's surname, or the first creator when there is no author, plus the first four digit year in Date. It strips accents and nonletter characters. Missing values produce `Unknown` and `nd`.
2. **Zotero item key** uses the eight character Zotero identifier, which is also always available through `{{itemKey}}`.
3. **Citation Key: in Extra** reads a single nonempty key from a line such as `Citation Key: Smith2025`. Matching is case insensitive. If the line is missing, empty, or contains spaces inside the key, the plugin falls back to the item key.

Guessed keys can collide and are not guaranteed to match Better BibTeX. This plugin does not query Better BibTeX or run its citation key generator. Extra mode only reads what has synced into the item's Extra field on zotero.org. A locally generated Better BibTeX key that has not been stored there is unavailable.

## Security and deletion

**The API key is stored unencrypted in `data.json`. Deletions through the Zotero API are permanent.** The password field only hides the key on screen. It does not encrypt storage.

Do not put `data.json` in GitHub, a public vault, or a shared archive. The provided `.gitignore` excludes it, but an ignore rule cannot remove a file already committed to Git history. If a key is exposed, revoke it at Zotero and create a replacement locally. Use only the library permissions you need.

The plugin sends authenticated requests to `https://api.zotero.org` to read metadata and create, update or remove linked URL attachments. Attachment URLs disclose your vault name and note path to Zotero and to anyone who can access those attachments, including group members. The attachment title is also sent. Note bodies are read locally to find item links, and are not uploaded. Clipboard text is read only when opening the create prompt. There is no telemetry or access to files outside the vault.

The only automatic deletion targets an attachment whose key was returned by a successful creation request and recorded with `createdByPlugin: true`. Immediately before deletion, the plugin fetches that exact key and verifies its item type is `attachment`, its link mode is `linked_url`, its parent matches the recorded Zotero item, its key differs from the parent key, and its URL is an Obsidian open link. It uses the fetched version as a write precondition. Zotero rejects a stale version with HTTP 412. See [Zotero write request documentation](https://www.zotero.org/support/dev/web_api/v3/write_requests).

Parent bibliographic items, Zotero notes, PDFs, snapshots, stored files, linked files, and unowned URL attachments are never deletion targets. The plugin never deletes vault files itself. Existing attachments matched by URL are recognized without granting ownership, so they are never automatically updated or deleted. Attachments created by the original local version cannot be proven owned and receive the same protection.

Ownership relies on the integrity of local `data.json`. It is bookkeeping, not a cryptographic proof. Tampering with that file or another plugin modifying it can invalidate the guarantee. Losing the map also loses ownership information, and the plugin deliberately declines to infer it from a URL.

Keep **Remove the Zotero link when a note is deleted** off to disable deletion. Keep **Confirm before deleting a Zotero link** on to review each eligible deletion. Turn on **Dry run** to skip every Zotero write, including attachment creation and URL updates. Dry run can still fetch metadata, create local notes and change local tracking. Settings cannot cancel a request that has already been sent.

## Known limitations

1. Metadata must be synced to Zotero. Changes reach the desktop app after another Zotero sync.
2. Renaming or moving notes while offline updates the local map but does not queue a remote retry. When online, run the attach command on the moved note to repair its tracked owned attachment.
3. Deletion is not retried after a failure, cancellation, or dry run. The deleted note's local mapping is removed, and the remote attachment may remain. Remove it manually in Zotero if needed.
4. Bulk folder deletion is untested in Obsidian. Only individual file delete events are handled. A folder event alone does not trigger remote deletion. Folder rename handling is covered by mocked tests but still needs application testing.
5. Events are handled only while the plugin is enabled. Moves or deletes while it is disabled do not reconcile at startup. There is no automatic scan that claims ownership of old notes.
6. Existing attachments and legacy mappings cannot be automatically renamed or deleted. After a move, running the attach command may create a new owned link while leaving the old unowned link. Remove obsolete links manually if desired.
7. Vault renames and differing vault names on other devices can leave old URLs. Run the attach command to repair a tracked owned attachment.
8. Multiple devices or plugin instances can create duplicate attachments because the read and create operations are separate. Requests are serialized within one running plugin instance only.
9. A network failure after successful remote creation but before saving its key can leave an unowned attachment. Inspect Zotero before retrying.
10. Runtime code uses Obsidian and browser APIs only, so `isDesktopOnly` is false. Actual mobile behavior, clipboard permissions, and minimum version compatibility still require testing.
11. The attach command prefers a stored target over note contents. Editing a tracked note's Zotero link does not retarget its stored mapping. A manually linked existing note should reference a bibliographic parent item.

## Troubleshooting

**HTTP 403:** Check that the key is valid and has read and write access to the requested personal or group library. Group permissions may also prevent writes. Create or update permissions at [Zotero API key settings](https://www.zotero.org/settings/keys). Enter the key only in the local plugin settings.

**HTTP 404:** Check the numeric user ID, group ID, and eight character item key. Sync Zotero and confirm the item appears in the same library on zotero.org. A link from another user's personal library is interpreted using your configured user ID. A previously removed tracked attachment may also return 404.

**HTTP 412:** The attachment changed after it was read. The plugin does not force the update or deletion. Inspect Zotero and run the attach command again for a URL repair.

**Attachment appears missing:** Sync Zotero, check the item's children, and verify attachment creation is enabled and dry run is off. Existing attachment matches do not create duplicates.

**Link opens the wrong vault or no note:** Check the vault name and path in the attachment URL. Run the attach command in the intended vault. Obsidian must be installed and able to open the `obsidian://` protocol on that device.

## Development and releases

The editable runtime source is `src/main.js`. `main.js` is generated by copying that source and is intentionally excluded from Git. There are no package dependencies and no install step is required. Use Node 22 or later.

```sh
npm run check
npm test
npm run build
```

Commit the source, manifest, versions file, styles, documentation, scripts, tests, package files and workflow to a dedicated public repository. Do not initialize the repository around your whole vault or home directory. Review the files selected for Git before committing. Never add `data.json`.

The GitHub workflow runs on tag pushes, checks that the tag exactly matches `manifest.json`, runs mocked safety tests, builds `main.js`, and creates a release containing `main.js`, `manifest.json` and `styles.css` when present. Version `0.4.0` requires tag `0.4.0`, without a `v` prefix. GitHub Actions needs permission to write repository contents. Only GitHub's automatically provided token is used, and no Zotero key is needed in Actions.

Update the versions in `manifest.json`, `package.json` and `package-lock.json` together. Maintain `versions.json` when compatibility requirements change. The build is deliberately readable and does not obfuscate or minify the source.

See [SUBMISSION.md](SUBMISSION.md) for the current official submission process and remaining checks, [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the code review, and [CHANGES.md](CHANGES.md) for every change in this release.

## License

MIT. See [LICENSE](LICENSE).
