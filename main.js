const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  normalizePath,
  requestUrl,
  TFile,
  TFolder,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  userId: "",
  apiKey: "",
  linkTitle: "Obsidian",
  keyProperty: "",
  folder: "",
  filenameTemplate: "{{title}} ({{itemKey}})",
  noteTemplate: "# {{title}}\n\n[Zotero]({{zoteroLink}})\n\n",
  citationKeyMode: "guess",
  attachAfterCreate: true,
  syncDelete: false,
  confirmDelete: true,
  dryRun: false,
  syncRename: true,
  // Maps note path to its Zotero item and the attachment created for it.
  links: {},
};

// Matches zotero://select/library/items/KEY and zotero://select/groups/123/items/KEY
const ZOTERO_LINK = /zotero:\/\/select\/(?:library|groups\/(\d+))\/items\/([A-Z0-9]{8})/;
// Matches web links such as https://www.zotero.org/groups/123/name/items/KEY
const ZOTERO_WEB = /zotero\.org\/(?:users\/\d+|groups\/(\d+))\/[^\s]*?items\/([A-Z0-9]{8})/;
const BARE_KEY = /^[A-Z0-9]{8}$/;

const TYPE_TAGS = {
  journalArticle: "article",
  book: "book",
  bookSection: "chapter",
  conferencePaper: "conference",
  thesis: "thesis",
  report: "report",
  preprint: "preprint",
  webpage: "web",
  magazineArticle: "article",
  newspaperArticle: "article",
};

// Returns { groupId, key } or null for a Zotero link, web link or bare item key.
function parseZotero(text) {
  if (!text) return null;
  const s = text.trim();
  let m = s.match(ZOTERO_LINK);
  if (m) return { groupId: m[1] || null, key: m[2] };
  m = s.match(ZOTERO_WEB);
  if (m) return { groupId: m[1] || null, key: m[2] };
  if (BARE_KEY.test(s)) return { groupId: null, key: s };
  return null;
}

function citeKeyFor(data, key, mode) {
  if (mode === "item") return key;
  if (mode === "extra") {
    const fromExtra = (data.extra || "").match(/^[ \t]*Citation Key:[ \t]*(\S+)[ \t]*$/im);
    return fromExtra ? fromExtra[1] : key;
  }
  const creators = data.creators || [];
  const first = creators.find((creator) => creator.creatorType === "author") || creators[0];
  const last = first ? first.lastName || first.name || "" : "";
  const ascii = last
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "");
  const year = (data.date || "").match(/\d{4}/);
  return (ascii || "Unknown") + (year ? year[0] : "nd");
}

function authorsFor(data) {
  const all = data.creators || [];
  const authors = all.filter((c) => c.creatorType === "author");
  const list = authors.length ? authors : all;
  return list
    .map((c) => (c.name ? c.name : [c.lastName, c.firstName].filter(Boolean).join(", ")))
    .join("; ");
}

function safeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|#^\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150)
    .trim();
}

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] === undefined ? "" : vars[k]));
}

class ZoteroLinkModal extends Modal {
  constructor(app, prefill, onSubmit) {
    super(app);
    this.prefill = prefill;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Create literature note from Zotero" });
    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "zotero://select/library/items/XXXXXXXX",
    });
    input.addClass("zotero-literature-link-input");
    input.value = this.prefill || "";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit(input.value);
      }
    });
    const button = contentEl.createEl("button", { text: "Create note", cls: "mod-cta" });
    button.addEventListener("click", () => this.submit(input.value));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  submit(value) {
    const v = value.trim();
    if (!v) return;
    this.close();
    this.onSubmit(v);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmDeleteModal extends Modal {
  constructor(app, path, resolve) {
    super(app);
    this.path = path;
    this.resolve = resolve;
    this.approved = false;
  }

  onOpen() {
    this.contentEl.createEl("h3", { text: "Remove Zotero link?" });
    this.contentEl.createEl("p", {
      text: `Permanently delete the link attachment for ${this.path}? The Zotero parent item remains.`,
    });
    const cancel = this.contentEl.createEl("button", { text: "Keep link" });
    cancel.addEventListener("click", () => this.close());
    const remove = this.contentEl.createEl("button", { text: "Delete link", cls: "mod-warning" });
    remove.addEventListener("click", () => {
      this.approved = true;
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
    this.resolve(this.approved);
  }
}

module.exports = class ZoteroLiteratureLink extends Plugin {
  async onload() {
    await this.loadSettings();
    this.operationQueue = Promise.resolve();
    this.active = true;

    this.addCommand({
      id: "create-literature-note",
      name: "Create literature note from Zotero link",
      callback: () => this.promptForLink(),
    });

    this.addCommand({
      id: "attach-obsidian-link",
      name: "Attach this note's link to its Zotero item",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) this.enqueue(() => this.attach(file));
        return true;
      },
    });

    this.addRibbonIcon("book-plus", "Create literature note from Zotero link", () =>
      this.promptForLink()
    );

    this.addSettingTab(new ZoteroLiteratureLinkSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) {
        const path = file.path;
        this.enqueue(() => this.onDelete({ path }));
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const path = file.path;
      const isFolder = file instanceof TFolder;
      this.enqueue(() => this.onRename({ path, isFolder }, oldPath));
    }));
  }

  onunload() {
    this.active = false;
    if (this.deleteModal) this.deleteModal.close();
  }

  enqueue(operation) {
    this.operationQueue = this.operationQueue.then(async () => {
      if (this.active) await operation();
    }).catch(() => {
      new Notice("Zotero Literature Connection could not finish the operation. Check your connection and settings.");
    });
    return this.operationQueue;
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.settings.links = Object.assign(Object.create(null), saved?.links || {});
    // Older versions never recorded proof of creation. Keep those entries unowned.
    for (const entry of Object.values(this.settings.links)) {
      if (entry.createdByPlugin !== true) entry.createdByPlugin = false;
    }
  }

  async saveSettings() {
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    const previous = this.saveQueue || Promise.resolve();
    this.saveQueue = previous.catch(() => {}).then(() => this.saveData(snapshot));
    await this.saveQueue;
  }

  libraryFor(groupId) {
    return groupId ? `groups/${groupId}` : `users/${this.settings.userId.trim()}`;
  }

  hasCredentials() {
    if (!/^\d+$/.test(this.settings.userId.trim()) || !this.settings.apiKey.trim()) {
      new Notice("Set your Zotero user ID and API key in the plugin settings first.");
      return false;
    }
    return true;
  }

  api(method, path, body, extraHeaders = {}) {
    if (!/^\/(?:users|groups)\/\d+\/items(?:\/[A-Z0-9]{8}(?:\/children)?)?(?:\?[^#]*)?$/.test(path)) {
      throw new Error("Invalid Zotero API path");
    }
    if (!this.active || (this.settings.dryRun && method !== "GET")) {
      new Notice(`Dry run or plugin disabled: skipped Zotero ${method}.`);
      return Promise.resolve({ status: 0 });
    }
    const headers = Object.assign(
      {
        "Zotero-API-Key": this.settings.apiKey.trim(),
        "Zotero-API-Version": "3",
      },
      body ? { "Content-Type": "application/json" } : {},
      extraHeaders
    );
    return requestUrl({
      url: "https://api.zotero.org" + path,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });
  }

  // Step 1: ask for the link, prefilled from the clipboard when it holds one.
  async promptForLink() {
    if (!this.hasCredentials()) return;
    let prefill = "";
    try {
      const clip = await navigator.clipboard.readText();
      if (parseZotero(clip)) prefill = clip.trim();
    } catch (e) {
      // Clipboard access can be denied, which is fine.
    }
    new ZoteroLinkModal(this.app, prefill, (value) => this.enqueue(() => this.createNote(value))).open();
  }

  async fetchItem(target) {
    const res = await this.api("GET", `/${target.library}/items/${target.key}`);
    if (res.status !== 200) return { status: res.status };
    let data = res.json.data;
    let key = target.key;
    // If the link points at a PDF or note, use its parent item instead.
    if (data.parentItem) {
      const parent = await this.api("GET", `/${target.library}/items/${data.parentItem}`);
      if (parent.status !== 200) return { status: parent.status };
      data = parent.json.data;
      key = data.key;
    }
    if (["attachment", "note"].includes(data.itemType)) return { status: 400 };
    return { status: 200, data, target: { library: target.library, key } };
  }

  // Step 2: fetch metadata, build the note, create it, then attach the link in Zotero.
  async createNote(input) {
    const parsed = parseZotero(input);
    if (!parsed) {
      new Notice("That does not look like a Zotero link.");
      return;
    }

    try {
      const found = await this.fetchItem({
        library: this.libraryFor(parsed.groupId),
        key: parsed.key,
      });
      if (found.status !== 200) {
        new Notice(
          `Zotero lookup failed (HTTP ${found.status}). The item may not have synced to zotero.org yet.`
        );
        return;
      }

      const { data, target } = found;
      const zoteroLink = target.library.startsWith("groups/")
        ? `zotero://select/${target.library}/items/${target.key}`
        : `zotero://select/library/items/${target.key}`;

      const vars = {
        citekey: citeKeyFor(data, target.key, this.settings.citationKeyMode),
        itemKey: target.key,
        title: data.title || "Untitled",
        authors: authorsFor(data),
        year: ((data.date || "").match(/\d{4}/) || [""])[0],
        publication: data.publicationTitle || "",
        doi: data.DOI || "",
        itemType: data.itemType,
        typeTag: TYPE_TAGS[data.itemType] || data.itemType.toLowerCase(),
        zoteroLink,
      };

      const name = safeFileName(render(this.settings.filenameTemplate, vars));
      if (!name || name === "." || name === "..") {
        new Notice("The file name template produced an empty or invalid name.");
        return;
      }
      const folder = normalizePath(this.settings.folder.trim().replace(/^\/+|\/+$/g, ""));
      if (folder.split("/").some((part) => part === "." || part === "..")) {
        new Notice("Choose a folder path inside this vault without dot segments.");
        return;
      }
      const path = normalizePath((folder ? folder + "/" : "") + name + ".md");

      let file = this.app.vault.getAbstractFileByPath(path);
      if (file) {
        if (!(file instanceof TFile) || file.extension !== "md") {
          new Notice("The target path belongs to a folder or a different file type.");
          return;
        }
        const existingTarget = this.settings.links[path] || await this.findTarget(file);
        if (!existingTarget || existingTarget.library !== target.library || existingTarget.key !== target.key) {
          new Notice("That path already exists for another or unknown Zotero item. Change the file name template.");
          return;
        }
        new Notice("That note already exists, opening it.");
      } else {
        if (folder && !this.app.vault.getAbstractFileByPath(normalizePath(folder))) {
          await this.app.vault.createFolder(normalizePath(folder));
        }
        file = await this.app.vault.create(path, render(this.settings.noteTemplate, vars));
        await this.remember(path, target);
        new Notice("Created " + name);
      }

      await this.app.workspace.getLeaf(false).openFile(file);

      if (this.settings.attachAfterCreate) await this.attach(file, target);
    } catch (err) {
      new Notice("Could not create the note. Check your folder, templates and Zotero connection.");
    }
  }

  uriFor(path) {
    return (
      "obsidian://open?vault=" +
      encodeURIComponent(this.app.vault.getName()) +
      "&file=" +
      encodeURIComponent(path.replace(/\.md$/, ""))
    );
  }

  async remember(path, target, attachmentKey, createdByPlugin = false) {
    this.settings.links[path] = {
      library: target.library,
      key: target.key,
      attachmentKey: attachmentKey || undefined,
      createdByPlugin,
    };
    await this.saveSettings();
  }

  hasCredentialsQuiet() {
    return /^\d+$/.test(this.settings.userId.trim()) && !!this.settings.apiKey.trim();
  }

  // Fetches only a recorded attachment owned by this plugin.
  async findAttachment(entry) {
    if (entry.createdByPlugin !== true || !BARE_KEY.test(entry.attachmentKey || "")) {
      return { status: 200 };
    }
    const res = await this.api("GET", `/${entry.library}/items/${entry.attachmentKey}`);
    if (res.status !== 200) return { status: res.status };
    const item = res.json;
    const match = item?.key === entry.attachmentKey &&
      item.key !== entry.key &&
      item.data?.itemType === "attachment" &&
      item.data.linkMode === "linked_url" &&
      item.data.parentItem === entry.key &&
      item.data.url?.startsWith("obsidian://open?") &&
      Number.isSafeInteger(item.data.version) && item.data.version >= 0
      ? item : undefined;
    return { status: 200, match };
  }

  async onDelete(file) {
    if (!file) return;
    const entry = this.settings.links[file.path];
    if (!entry) return;
    delete this.settings.links[file.path];
    await this.saveSettings();
    if (!this.settings.syncDelete || !this.hasCredentialsQuiet()) return;
    if (entry.createdByPlugin !== true || !entry.attachmentKey) return;

    try {
      if (this.settings.dryRun) {
        new Notice("Dry run: would check and remove this note's owned Zotero link.");
        return;
      }
      if (this.settings.confirmDelete) {
        const approved = await new Promise((resolve) => {
          this.deleteModal = new ConfirmDeleteModal(this.app, file.path, resolve);
          this.deleteModal.open();
        });
        this.deleteModal = null;
        if (!approved) return;
      }
      if (!this.active || !this.settings.syncDelete || this.settings.dryRun) return;
      const found = await this.findAttachment(entry);
      if (found.status !== 200) {
        new Notice(`Could not check Zotero for this note's link (HTTP ${found.status}).`);
        return;
      }
      if (!found.match) return;
      if (!this.active || !this.settings.syncDelete || this.settings.dryRun) return;
      const res = await this.api("DELETE", `/${entry.library}/items/${found.match.key}`, undefined, {
        "If-Unmodified-Since-Version": String(found.match.data.version),
      });
      if (res.status === 204) new Notice("Removed this note's link from Zotero.");
      else new Notice(`Could not remove the Zotero link (HTTP ${res.status}).`);
    } catch (err) {
      new Notice("Could not reach Zotero to remove the link.");
    }
  }

  async onRename(file, oldPath) {
    if (!file) return;
    if (file.isFolder) {
      const paths = Object.keys(this.settings.links).filter((path) => path.startsWith(oldPath + "/"));
      for (const path of paths) {
        await this.onRename({ path: file.path + path.slice(oldPath.length) }, path);
      }
      return;
    }
    const entry = this.settings.links[oldPath];
    if (!entry) return;
    delete this.settings.links[oldPath];
    this.settings.links[file.path] = entry;
    await this.saveSettings();
    if (!this.settings.syncRename || !this.hasCredentialsQuiet()) return;

    try {
      if (this.settings.dryRun) {
        new Notice("Dry run: would update this note's owned Zotero link.");
        return;
      }
      const found = await this.findAttachment(entry);
      if (found.status !== 200) {
        new Notice(`Could not check the Zotero link after moving the note (HTTP ${found.status}). Run the attach command to retry.`);
        return;
      }
      if (!found.match || !this.settings.syncRename) return;
      const res = await this.api(
        "PATCH",
        `/${entry.library}/items/${found.match.key}`,
        { url: this.uriFor(file.path) },
        { "If-Unmodified-Since-Version": String(found.match.data.version) }
      );
      if (res.status === 204) new Notice("Updated this note's link in Zotero.");
      else new Notice(`Could not update the Zotero link (HTTP ${res.status}).`);
    } catch (err) {
      new Notice("Could not reach Zotero to update the link.");
    }
  }

  // Finds the Zotero item a note belongs to: frontmatter property first, then the first Zotero link in the body.
  async findTarget(file) {
    const prop = this.settings.keyProperty.trim();
    if (prop) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const value = fm && fm[prop];
      if (typeof value === "string") {
        const p = parseZotero(value);
        if (p) return { library: this.libraryFor(p.groupId), key: p.key };
      }
    }
    const text = await this.app.vault.cachedRead(file);
    const m = text.match(ZOTERO_LINK);
    if (m) return { library: this.libraryFor(m[1]), key: m[2] };
    return null;
  }

  async attach(file, knownTarget) {
    if (!this.hasCredentials()) return;
    const { linkTitle } = this.settings;

    const target = knownTarget || this.settings.links[file.path] || (await this.findTarget(file));
    if (!target) {
      new Notice(
        "No Zotero item found in this note. Add a zotero://select link or set the key property in settings."
      );
      return;
    }

    const uri = this.uriFor(file.path);

    const base = `/${target.library}/items`;

    try {
      if (this.settings.dryRun) {
        new Notice("Dry run: skipped creating or updating the Zotero link. Local note creation still works.");
        return;
      }
      const remembered = this.settings.links[file.path];
      if (remembered?.createdByPlugin && remembered.library === target.library && remembered.key === target.key) {
        const found = await this.findAttachment(remembered);
        if (found.status !== 200 && found.status !== 404) {
          new Notice(`Could not check the tracked attachment (HTTP ${found.status}).`);
          return;
        }
        if (found.match) {
          if (found.match.data.url !== uri) {
            const updated = await this.api("PATCH", `${base}/${found.match.key}`, { url: uri }, {
              "If-Unmodified-Since-Version": String(found.match.data.version),
            });
            if (updated.status !== 204) {
              new Notice(`Could not update the tracked Zotero link (HTTP ${updated.status}).`);
              return;
            }
          }
          new Notice("This note is linked in Zotero.");
          return;
        }
      }
      const children = await this.fetchAttachments(base, target.key);
      if (children.status !== 200) {
        new Notice(`Zotero lookup failed (HTTP ${children.status}). Check the user ID, API key and item.`);
        return;
      }
      const already = children.json.find(
        (c) => c.data?.itemType === "attachment" && c.data.linkMode === "linked_url" && c.data.url === uri
      );
      if (already) {
        await this.remember(file.path, target, already.key, false);
        new Notice("This note is already linked in Zotero. Existing attachments are never owned or deleted by this plugin.");
        return;
      }

      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
      const res = await this.api(
        "POST",
        base,
        [
          {
            itemType: "attachment",
            linkMode: "linked_url",
            parentItem: target.key,
            title: linkTitle || "Obsidian",
            url: uri,
            contentType: "",
            tags: [],
            relations: {},
          },
        ],
        { "Zotero-Write-Token": token }
      );

      if (res.status === 403) {
        new Notice("Zotero refused the write. Give the API key write access to this library.");
        return;
      }
      if (res.status !== 200) {
        new Notice(`Zotero write failed (HTTP ${res.status}).`);
        return;
      }
      const failed = res.json && res.json.failed ? Object.values(res.json.failed) : [];
      if (failed.length) {
        new Notice("Zotero rejected the link. Check the item and library permissions.");
        return;
      }
      const created = res.json && res.json.successful && res.json.successful["0"];
      const createdKey = created?.key || res.json?.success?.["0"];
      if (!BARE_KEY.test(createdKey || "")) {
        new Notice("Zotero returned no creation key. The attachment cannot safely be tracked. Check Zotero before retrying.");
        return;
      }
      await this.remember(file.path, target, createdKey, true);
      new Notice("Linked this note to its Zotero item. It appears in Zotero after sync.");
    } catch (err) {
      new Notice("Could not complete the Zotero link operation. Check the connection and Zotero before retrying.");
    }
  }

  async fetchAttachments(base, key) {
    const items = [];
    for (let start = 0; ; start += 100) {
      const response = await this.api("GET", `${base}/${key}/children?itemType=attachment&limit=100&start=${start}`);
      if (response.status !== 200) return { status: response.status };
      if (!Array.isArray(response.json)) return { status: 502 };
      items.push(...response.json);
      if (response.json.length < 100) return { status: 200, json: items };
    }
  }
};

class ZoteroLiteratureLinkSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    new Setting(containerEl).setName("Zotero connection").setHeading();

    const text = (name, desc, key, extra) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) => {
          if (extra) extra(t);
          t.setValue(s[key]).onChange(async (v) => {
            s[key] = v;
            await this.plugin.saveSettings();
          });
        });

    text("Zotero user ID", "The number shown at zotero.org/settings/keys, not your username.", "userId");

    text(
      "Zotero API key",
      "Needs write access to each library you use. Stored unencrypted in data.json. Keep it out of shared or public vaults.",
      "apiKey",
      (t) => (t.inputEl.type = "password")
    );

    text("Attachment title", "The title shown on the link inside Zotero.", "linkTitle");

    text(
      "Frontmatter property for the item key",
      "Optional. If set and present in a note, it is used before looking for a Zotero link in the note body.",
      "keyProperty"
    );

    new Setting(containerEl).setName("Literature notes").setHeading();

    text("Folder", "Leave empty to create notes in the vault root. A specified folder is created if needed.", "folder");

    text(
      "File name template",
      "Placeholders: {{citekey}} {{itemKey}} {{title}} {{authors}} {{year}} {{publication}} {{doi}} {{itemType}} {{typeTag}} {{zoteroLink}}",
      "filenameTemplate"
    );

    new Setting(containerEl)
      .setName("Note template")
      .setDesc("Starting content of a new note. Same placeholders as above, plus {{zoteroLink}}.")
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.addClass("zotero-literature-link-template");
        t.setValue(s.noteTemplate).onChange(async (v) => {
          s.noteTemplate = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Citation key source")
      .setDesc("Guess from author and year, use the Zotero item key, or read Citation Key: from Extra. Missing Extra keys fall back to the item key.")
      .addDropdown((dropdown) => dropdown
        .addOption("guess", "Guess from author and year")
        .addOption("item", "Zotero item key")
        .addOption("extra", "Citation Key: in Extra")
        .setValue(s.citationKeyMode)
        .onChange(async (value) => {
          s.citationKeyMode = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("Link safety and synchronization").setHeading();

    new Setting(containerEl)
      .setName("Remove the Zotero link when a note is deleted")
      .setDesc("Off by default for new installs. Permanently deletes only a verified linked URL attachment recorded as created by this plugin. Never deletes the parent item.")
      .addToggle((t) =>
        t.setValue(s.syncDelete).onChange(async (v) => {
          s.syncDelete = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Confirm before deleting a Zotero link")
      .setDesc("Ask for each tracked note deletion. Canceling keeps the remote attachment.")
      .addToggle((toggle) => toggle.setValue(s.confirmDelete).onChange(async (value) => {
        s.confirmDelete = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Dry run")
      .setDesc("Skip all Zotero writes, including creation, updates and deletion. Local notes and local tracking can still change.")
      .addToggle((toggle) => toggle.setValue(s.dryRun).onChange(async (value) => {
        s.dryRun = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Update the Zotero link when a note is renamed or moved")
      .addToggle((t) =>
        t.setValue(s.syncRename).onChange(async (v) => {
          s.syncRename = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Attach the Obsidian link in Zotero after creating a note")
      .addToggle((t) =>
        t.setValue(s.attachAfterCreate).onChange(async (v) => {
          s.attachAfterCreate = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
