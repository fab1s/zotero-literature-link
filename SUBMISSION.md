# Community submission checklist

Checked against current official documentation on 14 October 2026. The [public repository](https://github.com/fab1s/zotero-literature-link) publishes the source, documentation and [release assets](https://github.com/fab1s/zotero-literature-link/releases). Official listing appears feasible, but application testing and Community submission remain outstanding. The plugin has not been submitted or approved for the official Community directory.

## Current process

Publish the reviewable source in a public GitHub repository. Create a release whose tag exactly matches the manifest version and attach `main.js`, `manifest.json`, and optional `styles.css`. Put the README, license and manifest at the repository root. Submit through the [Obsidian Community directory](https://community.obsidian.md), sign in with your Obsidian account, connect your GitHub account, and add your repository. The directory reads the manifest from the default branch and reports automated review feedback. This is the process currently described in [Submit your plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## Prepared

1. Complete runtime source and a reproducible build that produces identical `main.js` bytes.
2. The selected name **Zotero Literature Link** and ID `zotero-literature-link`, version `0.4.0`, a concise description, author attribution, compatibility target and desktop flag.
3. `versions.json`, README, MIT license, secret exclusions, a release workflow and mocked regression tests.
4. Explicit account and network disclosures, local credential storage warning, permanent deletion warning and library privacy information.
5. Runtime code uses `this.app`, Obsidian vault APIs, `loadData`, `saveData`, `requestUrl`, registered events and CSS classes. There are no runtime Node or Electron imports, telemetry, default hotkeys, or commands that repeat the plugin ID.

## Still required before submission

1. Review author attribution and confirm that you have permission to license all supplied code under MIT. A dedicated public GitHub repository and release are provided; official Community approval is still outstanding.
2. Recheck the name and ID in the live Community directory immediately before submission. Neither was found in the [official published plugin registry](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) during preparation. That check does not reserve the name or establish that no pending entry exists. See the [manifest naming rules](https://docs.obsidian.md/Reference/Manifest).
3. Test on the declared minimum version, 1.4.0, and the current stable Obsidian version. Increase the minimum if those tests fail. The [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) require an appropriate minimum version, a short description ending with a period, and a desktop flag that reflects Node or Electron API use. The runtime API signatures were reviewed, but no installed app compatibility test has been run.
4. Test desktop and mobile installations, clipboard access, settings, both commands, personal and group libraries, and protocol links. Runtime browser APIs support the current `isDesktopOnly: false` design, but that is not evidence of actual mobile testing. If mobile proves unsupported, fix the issue or set the desktop flag appropriately.
5. Test against a disposable Zotero library using a locally entered key. Check metadata retrieval, attachment creation, repeated attach, rename, move, offline recovery, cancellation, enabled deletion, disabled deletion, dry run, and conflicts. Inspect PDFs, Zotero notes and unowned attachments before and after. No real API writes or deletions were performed during preparation.
6. Test nested folder moves and bulk folder deletion in Obsidian. Folder moves are covered only with mocked events. Bulk deletion remains untested and is disclosed in the README.
7. Run `npm run check`, `npm test`, and `npm run build` for future source changes. These checks passed locally, including 31 mocked tests. The GitHub release workflow repeats the checks; its results are available under the repository's Actions tab. Review [plugin guidelines](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/main/en/Plugins/Releasing/Plugin%20guidelines.md) for UI, resource cleanup and API recommendations. The source remains readable; optional minification is a future build improvement.
8. Inspect the public Git history and published release assets. The initial source upload excludes `data.json` and credentials. Verify manual installation and BRAT installation from the release before official submission.
9. Check the README disclosures against the [Developer policies](https://docs.obsidian.md/community-directory/developer-policies), which prohibit hidden code, client telemetry and self installation or updates, and require disclosures for accounts and network use. Confirm there is no third party code requiring additional attribution.
10. Submit using the Community directory and resolve its automated review feedback. Keep the default branch manifest and release version aligned. Requirements can change, so recheck the linked official pages when submitting.

## Version compatibility

The manifest retains the original 1.4.0 compatibility target. Public Obsidian API annotations show the settings heading API predates that version. The new code uses existing vault, modal and setting APIs together with browser cryptography. This assessment does not replace testing on that version. See the [official API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

The [versions documentation](https://docs.obsidian.md/Reference/Versions) explains how `versions.json` maps plugin releases to minimum supported app versions. Future releases should preserve the appropriate compatibility entries.
