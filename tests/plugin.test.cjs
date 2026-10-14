const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const { webcrypto } = require("node:crypto");

function setup(saved = {}, responder = async () => ({ status: 204 })) {
  const requests = [];
  const notices = [];
  const files = new Map();
  const events = {};
  const modals = [];
  const saves = [];
  const buttons = [];
  const element = () => ({
    empty() {},
    createEl(tag, options) {
      const el = element();
      el.options = options;
      el.addEventListener = (name, callback) => { el[name] = callback; };
      if (tag === "button") buttons.push(el);
      return el;
    },
  });
  class TFile {
    constructor(path) { this.path = path; this.extension = path.split(".").pop(); }
  }
  class TFolder {
    constructor(path) { this.path = path; }
  }
  class Modal {
    constructor(app) { this.app = app; this.contentEl = element(); }
    open() { modals.push(this); this.onOpen(); }
    close() { this.onClose(); }
  }
  class Plugin {
    constructor(app) { this.app = app; }
    async loadData() { return structuredClone(saved); }
    async saveData(value) { saves.push(structuredClone(value)); }
    addCommand() {}
    addRibbonIcon() {}
    addSettingTab() {}
    registerEvent() {}
  }
  const obsidian = {
    Plugin, Modal, TFile, TFolder,
    PluginSettingTab: class {},
    Setting: class {},
    Notice: class { constructor(text) { notices.push(text); } },
    normalizePath: (path) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
    requestUrl: async (options) => {
      requests.push(options);
      return responder(options);
    },
  };
  const sandbox = {
    module: { exports: {} },
    require: (name) => { assert.equal(name, "obsidian"); return obsidian; },
    crypto: webcrypto,
    Uint8Array,
    setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(require.resolve("../src/main.js"), "utf8") +
    "\nmodule.exports.helpers = { citeKeyFor, parseZotero, DEFAULT_SETTINGS };", sandbox);
  const app = {
    vault: {
      getName: () => "Test vault",
      getAbstractFileByPath: (path) => files.get(path),
      cachedRead: async (file) => file.content || "",
      createFolder: async (path) => { files.set(path, new TFolder(path)); },
      create: async (path, content) => {
        const file = new TFile(path);
        file.content = content;
        files.set(path, file);
        return file;
      },
      on: (name, callback) => { events[name] = callback; return {}; },
    },
    workspace: { getLeaf: () => ({ openFile: async () => {} }) },
    metadataCache: { getFileCache: () => ({}) },
  };
  const PluginClass = sandbox.module.exports;
  const plugin = new PluginClass(app);
  return { plugin, PluginClass, requests, notices, files, events, saves, modals, buttons, TFile, TFolder };
}

async function ready(saved = {}, responder) {
  const context = setup(saved, responder);
  await context.plugin.onload();
  context.plugin.hasCredentials = () => true;
  context.plugin.hasCredentialsQuiet = () => true;
  return context;
}

const entry = () => ({ library: "users/123", key: "PARENT12", attachmentKey: "ATTACH12", createdByPlugin: true });
const attachment = (changes = {}) => ({
  key: "ATTACH12",
  data: {
    itemType: "attachment", linkMode: "linked_url", parentItem: "PARENT12",
    url: "obsidian://open?vault=Test%20vault&file=Old", version: 7, ...changes,
  },
});
const count = (context, method) => context.requests.filter((request) => request.method === method).length;

test("New installs use neutral defaults and disable deletion", async () => {
  const { plugin } = await ready();
  assert.equal(plugin.settings.syncDelete, false);
  assert.equal(plugin.settings.confirmDelete, true);
  assert.equal(plugin.settings.folder, "");
  assert.equal(plugin.settings.filenameTemplate, "{{title}} ({{itemKey}})");
  assert.equal(plugin.settings.apiKey, "");
});

test("Legacy mappings remain unowned and custom settings survive", async () => {
  const context = await ready({ folder: "Custom", syncDelete: true, links: { "Old.md": { ...entry(), createdByPlugin: undefined } } });
  assert.equal(context.plugin.settings.folder, "Custom");
  assert.equal(context.plugin.settings.links["Old.md"].createdByPlugin, false);
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(context.requests.length, 0);
});

test("Citation key choices use the selected source", async () => {
  const context = await ready();
  const { citeKeyFor } = context.PluginClass.helpers;
  const data = {
    creators: [{ creatorType: "editor", lastName: "Editor" }, { creatorType: "author", lastName: "García" }],
    date: "2025", extra: "Other: value\nCitation Key: Custom2025\n", citationKey: "Ignored",
  };
  assert.equal(citeKeyFor(data, "PARENT12", "guess"), "Garcia2025");
  assert.equal(citeKeyFor(data, "PARENT12", "item"), "PARENT12");
  assert.equal(citeKeyFor(data, "PARENT12", "extra"), "Custom2025");
  assert.equal(citeKeyFor({ extra: "Citation Key:\nTitle: something" }, "PARENT12", "extra"), "PARENT12");
});

for (const [name, changes] of Object.entries({
  "a PDF": { linkMode: "imported_file" },
  "a linked file": { linkMode: "linked_file" },
  "a parent item": { itemType: "book" },
  "another parent": { parentItem: "OTHER123" },
  "a missing version": { version: undefined },
  "a changed external URL": { url: "https://example.com" },
})) {
  test(`Deletion refuses ${name}`, async () => {
    const context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": entry() } },
      async () => ({ status: 200, json: attachment(changes) }));
    await context.plugin.onDelete({ path: "Old.md" });
    assert.equal(count(context, "DELETE"), 0);
  });
}

test("Deletion refuses a response with another key", async () => {
  const context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": entry() } },
    async () => ({ status: 200, json: { ...attachment(), key: "OTHER123" } }));
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(count(context, "DELETE"), 0);
});

test("A stored parent key can never become the DELETE target", async () => {
  const context = await ready({ syncDelete: true, confirmDelete: false, links: {
    "Old.md": { ...entry(), attachmentKey: "PARENT12" },
  } }, async () => ({ status: 200, json: { ...attachment(), key: "PARENT12" } }));
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(count(context, "DELETE"), 0);
});

test("A deletion conflict is reported without a forced retry", async () => {
  const context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": entry() } },
    async (request) => request.method === "GET" ? { status: 200, json: attachment() } : { status: 412 });
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(count(context, "DELETE"), 1);
  assert.ok(context.notices.some((notice) => notice.includes("412")));
});

test("An unowned existing attachment is never automatically renamed", async () => {
  const context = await ready({ links: { "Old.md": { ...entry(), createdByPlugin: false } } });
  await context.plugin.onRename({ path: "New.md" }, "Old.md");
  assert.equal(context.requests.length, 0);
  assert.equal(context.plugin.settings.links["New.md"].createdByPlugin, false);
});

test("Deletion uses only the owned key and a version precondition", async () => {
  const context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": entry() } },
    async (request) => request.method === "GET" ? { status: 200, json: attachment() } : { status: 204 });
  await context.plugin.onDelete({ path: "Old.md" });
  const deletion = context.requests.find((request) => request.method === "DELETE");
  assert.equal(deletion.url, "https://api.zotero.org/users/123/items/ATTACH12");
  assert.equal(deletion.headers["If-Unmodified-Since-Version"], "7");
});

test("Missing ownership or creation key never falls back to URL deletion", async () => {
  for (const changes of [{ createdByPlugin: false }, { attachmentKey: undefined }]) {
    const context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": { ...entry(), ...changes } } });
    await context.plugin.onDelete({ path: "Old.md" });
    assert.equal(context.requests.length, 0);
  }
});

test("Deletion confirmation can be canceled", async () => {
  const context = await ready({ syncDelete: true, links: { "Old.md": entry() } });
  const pending = context.plugin.onDelete({ path: "Old.md" });
  await new Promise(setImmediate);
  context.modals[0].close();
  await pending;
  assert.equal(context.requests.length, 0);
});

test("Approval precedes a fresh attachment check", async () => {
  const context = await ready({ syncDelete: true, links: { "Old.md": entry() } },
    async (request) => request.method === "GET" ? { status: 200, json: attachment() } : { status: 204 });
  const pending = context.plugin.onDelete({ path: "Old.md" });
  await new Promise(setImmediate);
  assert.equal(context.requests.length, 0);
  context.buttons.find((button) => button.options.text === "Delete link").click();
  await pending;
  assert.equal(count(context, "DELETE"), 1);
});

test("Turning deletion off while checking prevents DELETE", async () => {
  let context;
  context = await ready({ syncDelete: true, confirmDelete: false, links: { "Old.md": entry() } }, async () => {
    context.plugin.settings.syncDelete = false;
    return { status: 200, json: attachment() };
  });
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(count(context, "DELETE"), 0);
});

test("Dry run blocks every write at the API boundary", async () => {
  const context = await ready({ dryRun: true });
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.equal((await context.plugin.api(method, "/users/123/items/ATTACH12")).status, 0);
  }
  assert.equal(context.requests.length, 0);
});

test("Dry run deletion only updates local tracking", async () => {
  const context = await ready({ dryRun: true, syncDelete: true, links: { "Old.md": entry() } });
  await context.plugin.onDelete({ path: "Old.md" });
  assert.equal(context.requests.length, 0);
  assert.equal(context.plugin.settings.links["Old.md"], undefined);
});

test("Matching existing attachments are remembered without ownership", async () => {
  const context = await ready({}, async () => ({ status: 200, json: [attachment()] }));
  await context.plugin.attach({ path: "Old.md" }, entry());
  assert.equal(context.plugin.settings.links["Old.md"].createdByPlugin, false);
  assert.equal(count(context, "POST"), 0);
});

test("A successful POST stores its returned key and ownership", async () => {
  for (const response of [{ successful: { "0": { key: "ATTACH12" } } }, { success: { "0": "ATTACH12" } }]) {
    const context = await ready({}, async (request) => request.method === "GET" ? { status: 200, json: [] } : { status: 200, json: response });
    await context.plugin.attach({ path: "Old.md" }, entry());
    assert.equal(context.plugin.settings.links["Old.md"].createdByPlugin, true);
    assert.equal(context.plugin.settings.links["Old.md"].attachmentKey, "ATTACH12");
    const creation = context.requests.find((request) => request.method === "POST");
    assert.equal(JSON.parse(creation.body)[0].linkMode, "linked_url");
    assert.match(creation.headers["Zotero-Write-Token"], /^[a-f0-9]{32}$/);
  }
});

test("Ambiguous or failed POST responses never grant ownership", async () => {
  for (const response of [{}, { failed: { "0": { message: "Rejected" } } }]) {
    const context = await ready({}, async (request) => request.method === "GET" ? { status: 200, json: [] } : { status: 200, json: response });
    await context.plugin.attach({ path: "Old.md" }, entry());
    assert.equal(context.plugin.settings.links["Old.md"], undefined);
  }
});

test("Offline rename keeps the owned key for explicit recovery", async () => {
  const context = await ready({ links: { "Old.md": entry() } }, async () => { throw new Error("Offline"); });
  await context.plugin.onRename({ path: "New.md" }, "Old.md");
  assert.equal(context.plugin.settings.links["Old.md"], undefined);
  assert.equal(context.plugin.settings.links["New.md"].attachmentKey, "ATTACH12");
  context.requests.length = 0;
  context.plugin.api = async (method, path, body) => {
    context.requests.push({ method, path, body });
    return method === "GET" ? { status: 200, json: attachment() } : { status: 204 };
  };
  await context.plugin.attach({ path: "New.md" });
  assert.equal(count(context, "POST"), 0);
  assert.equal(count(context, "PATCH"), 1);
});

test("Folder moves update all tracked descendant paths", async () => {
  const context = await ready({ syncRename: false, links: { "Folder/A.md": entry(), "Folder/Nested/B.md": entry(), "Other.md": entry() } });
  await context.plugin.onRename({ path: "Moved", isFolder: true }, "Folder");
  assert.ok(context.plugin.settings.links["Moved/A.md"]);
  assert.ok(context.plugin.settings.links["Moved/Nested/B.md"]);
  assert.ok(context.plugin.settings.links["Other.md"]);
  assert.equal(context.plugin.settings.links["Folder/A.md"], undefined);
});

test("Rapid rename events preserve captured paths and one key", async () => {
  const context = await ready({ syncRename: false, links: { "Old.md": entry() } });
  const file = new context.TFile("Middle.md");
  context.events.rename(file, "Old.md");
  file.path = "Final.md";
  context.events.rename(file, "Middle.md");
  await context.plugin.operationQueue;
  assert.equal(context.plugin.settings.links["Final.md"].attachmentKey, "ATTACH12");
  assert.equal(Object.keys(context.plugin.settings.links).length, 1);
});

test("Attachment matching includes pages beyond the first 100 results", async () => {
  const context = await ready({}, async (request) => ({
    status: 200,
    json: request.url.endsWith("start=0") ? Array.from({ length: 100 }, () => attachment({ url: "https://example.com" })) : [attachment()],
  }));
  await context.plugin.attach({ path: "Old.md" }, entry());
  assert.equal(count(context, "GET"), 2);
  assert.equal(count(context, "POST"), 0);
});

test("An existing unrelated note cannot be attached through a name collision", async () => {
  const context = await ready({ filenameTemplate: "Collision" }, async () => ({
    status: 200, json: { data: { key: "PARENT12", itemType: "book", title: "Book" } },
  }));
  context.files.set("Collision.md", new context.TFile("Collision.md"));
  await context.plugin.createNote("PARENT12");
  assert.equal(count(context, "POST"), 0);
  assert.equal(context.plugin.settings.links["Collision.md"], undefined);
});

test("Local creation works in dry run and remembers the target", async () => {
  const context = await ready({ dryRun: true, userId: "123" }, async () => ({
    status: 200, json: { data: { key: "PARENT12", itemType: "book", title: "Book" } },
  }));
  await context.plugin.createNote("PARENT12");
  assert.ok(context.files.get("Book (PARENT12).md"));
  assert.equal(context.plugin.settings.links["Book (PARENT12).md"].key, "PARENT12");
  assert.equal(count(context, "POST"), 0);
});

test("An unavailable parent prevents creation from an attachment", async () => {
  const context = await ready({ userId: "123" }, async (request) => request.url.endsWith("ATTACH12")
    ? { status: 200, json: { data: attachment().data } } : { status: 404 });
  await context.plugin.createNote("ATTACH12");
  assert.equal(context.files.size, 0);
});

test("Plugin unload prevents queued writes and closes confirmation", async () => {
  const context = await ready({ syncDelete: true, links: { "Old.md": entry() } });
  const pending = context.plugin.onDelete({ path: "Old.md" });
  await new Promise(setImmediate);
  context.plugin.onunload();
  await pending;
  assert.equal(context.requests.length, 0);
  await context.plugin.api("DELETE", "/users/123/items/ATTACH12");
  assert.equal(context.requests.length, 0);
});
