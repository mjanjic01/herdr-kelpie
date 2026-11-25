// A task's folder as a dialog: the file tree on the left, the chosen file on the
// right (markdown rendered, JSON pretty, images shown, the rest as code).
// The folder is the engine's tasks/<id>/: the brief, results, handoff notes, files.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, Editor, EditorState } from "gpui-base";
import { theme, props, closeOverlay, exec, readTextFile, settings, appHome } from "herdr";
import { task, taskDir, isImage, fmtSize, openFile, imagePath, MOD } from "./state.js";
import { titleRow, closeButton, tiny } from "./ui.js";

const LIMIT = 3000;          // entries listed at most
const PREVIEW = 400000;      // characters shown at most
const LANG = { mjs: "js", ts: "js", tsx: "js", jsx: "js", yml: "yaml", jsonc: "json", log: "txt" };
const icon = (name) => `mods/${MOD}/${name}.svg`;
const REMOTE_IMAGE = 15 * 1048576; // the largest picture copied over from another machine

// Where a picture from another machine is copied to be drawn: image() loads only
// files on this Mac. One folder per task, emptied when the dialog closes.
const previewDir = (id) => `${appHome()}/board/cache/previews/${id}`;

// Every file and folder under dir, relative, with sizes and change times. One
// `find` per load; it runs on the task's machine.
async function listing(dir, on) {
  // Lines are "<d|f> <size> <mtime> <path>": GNU find prints them itself, BSD
  // (macOS) find hands the files to stat.
  const bsd = 'find . -mindepth 1 -name .git -prune -o \\( -type d -exec printf "d 0 0 %s\\n" {} + \\) -o \\( -type f -exec stat -f "f %z %m %N" {} + \\)';
  const gnu = 'find . -mindepth 1 -name .git -prune -o -type d -printf "d 0 0 %p\\n" -o -type f -printf "f %s %T@ %p\\n"';
  const r = await exec("sh", ["-c", `cd "$1" || exit 1; if find . -maxdepth 0 -printf "" >/dev/null 2>&1; then ${gnu}; else ${bsd}; fi 2>/dev/null | head -n ${LIMIT}`, "files", dir], { on });
  if (r.code !== 0) throw new Error((r.stderr || "Cannot list this folder").trim());
  return r.stdout.split("\n").filter(Boolean).map((line) => {
    const [kind, size, at, ...rest] = line.split(" ");
    return { dir: kind === "d", size: Number(size) || 0, at: Math.floor(Number(at) || 0) * 1000, path: rest.join(" ").replace(/^\.\//, "") };
  }).filter((e) => e.path && e.path !== ".");
}

// The listing as a tree: path -> children, folders first, then by name.
function treeOf(entries) {
  const kids = new Map([["", []]]);
  for (const e of entries) {
    const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(e);
    if (e.dir && !kids.has(e.path)) kids.set(e.path, []);
  }
  for (const list of kids.values()) list.sort((a, b) => (b.dir - a.dir) || a.path.localeCompare(b.path, undefined, { numeric: true }));
  return kids;
}

// A file's icon and color by its extension: [icon, theme color].
const TYPES = [
  [["md", "markdown", "txt", "rst"], "ft-text", "ansi4"],
  [["json", "jsonc", "json5"], "ft-json", "ansi3"],
  [["js", "mjs", "cjs", "jsx"], "ft-code", "ansi3"],
  [["ts", "mts", "cts", "tsx"], "ft-code", "ansi4"],
  [["rb", "py", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "php", "lua"], "ft-code", "ansi1"],
  [["html", "htm", "xml", "svelte", "vue", "hbs"], "ft-code", "ansi1"],
  [["css", "scss", "sass", "less"], "ft-code", "ansi6"],
  [["sh", "bash", "zsh", "fish", "log", "out", "err"], "ft-terminal", "ansi2"],
  [["yml", "yaml", "toml", "ini", "env", "conf", "cfg", "lock"], "ft-config", "ansi5"],
  [["csv", "tsv", "xlsx", "xls"], "ft-table", "ansi2"],
  [["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"], "ft-image", "ansi5"],
  [["mp4", "mov", "webm", "mkv"], "ft-video", "ansi5"],
  [["zip", "gz", "tgz", "tar", "bz2", "xz", "7z", "rar"], "ft-archive", "muted"],
  [["diff", "patch"], "ft-code", "ansi6"],
];
const TYPE_OF = new Map(TYPES.flatMap(([exts, ic, color]) => exts.map((x) => [x, [ic, color]])));
const fileType = (path) => TYPE_OF.get(extOf(path)) ?? ["file", "dim"];

const nameOf = (path) => path.split("/").pop();
const extOf = (path) => (nameOf(path).includes(".") ? nameOf(path).split(".").pop().toLowerCase() : "");
const isMarkdown = (path) => /^(md|markdown)$/.test(extOf(path));

// The file to show first: the brief, else a plan, else the newest markdown file.
function firstFile(entries) {
  const files = entries.filter((e) => !e.dir);
  return files.find((e) => e.path === "brief.md")?.path
    ?? files.find((e) => /^plan\.md$/i.test(e.path))?.path
    ?? [...files].filter((e) => isMarkdown(e.path)).sort((a, b) => b.at - a.at)[0]?.path
    ?? files[0]?.path ?? null;
}

export class FilesView extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.id = p.id ?? null;
    const t = task(this.id);
    this.machine = t?.machine ?? null;
    this.root = taskDir(t);
    this.entries = [];
    this.kids = new Map([["", []]]);
    this.open = new Set();
    this.file = null;
    this.error = "";
    this.loading = true;
    this.handle = cx.focus_handle();
    this.handle.focus();
    // A spawn straight from a dialog's init never finishes: start from a timer.
    cx.timer.after(60, (cx) => this.load(cx, true));
    cx.timer.every(5000, (cx) => this.load(cx, false));
  }

  // Called by Esc and ✕, then by Herdr as the dialog goes: Herdr awaits what it
  // returns, so the copied pictures are gone before the view is dropped.
  close() {
    if (this.closed) return this.cleanup;
    this.closed = true;
    this.code?.release();
    this.cleanup = this.machine && this.id ? exec("rm", ["-rf", previewDir(this.id)]).catch(() => {}) : null;
    closeOverlay(props().overlay);
    return this.cleanup;
  }

  load(cx, first) {
    if (this.busy || !this.root) { if (!this.root) { this.loading = false; this.error = "This task has no folder yet."; cx.notify(); } return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const entries = await listing(this.root, this.machine);
        if (this.closed) return;
        const before = JSON.stringify(this.entries.map((e) => [e.path, e.size, e.at]));
        this.entries = entries;
        this.kids = treeOf(entries);
        this.error = "";
        if (first) {
          // Open the small folders; big ones (screenshots, checks) stay folded.
          for (const e of entries) if (e.dir && (this.kids.get(e.path)?.length ?? 0) <= 12) this.open.add(e.path);
          // A file asked for in props: its folders open too.
          for (let d = props()?.file ?? ""; d.includes("/");) { d = d.slice(0, d.lastIndexOf("/")); this.open.add(d); }
          const f = (props()?.file && entries.some((e) => e.path === props().file && !e.dir)) ? props().file : firstFile(entries);
          if (f) this.show(f, cx);
        } else if (this.file) {
          // The shown file changed on disk (an agent wrote it): read it again.
          const now = entries.find((e) => e.path === this.file);
          if (!now) { this.code?.release(); this.code = null; this.text = null; this.fileError = "This file is gone."; }
          else if (now.at !== this.fileAt || now.size !== this.fileSize) this.show(this.file, cx, true);
        }
        if (first || before !== JSON.stringify(entries.map((e) => [e.path, e.size, e.at]))) cx.notify();
      } catch (e) { this.error = String(e?.message ?? e); cx.notify(); }
      finally { this.busy = false; if (this.loading) { this.loading = false; cx.notify(); } }
    });
  }

  show(path, cx, again = false) {
    const entry = this.entries.find((e) => e.path === path);
    if (!again) { this.code?.release(); this.code = null; this.text = null; }
    this.file = path; this.fileError = ""; this.fileAt = entry?.at; this.fileSize = entry?.size;
    if (!this.handle.is_focused()) this.handle.focus();
    cx.notify();
    if (isImage(path)) { if (this.machine) this.fetchImage(path, entry, cx); return; }
    if ((entry?.size ?? 0) > 20 * 1048576) { this.fileError = `Too large to preview (${fmtSize(entry.size)}).`; return; }
    cx.spawn(async (cx) => {
      try {
        let text = await readTextFile(`${this.root}/${path}`, { on: this.machine });
        if (this.file !== path || this.closed) return;
        if (text === null) { this.fileError = "This file is no longer there."; return; }
        if (text.includes("\0")) { this.fileError = "A binary file: no preview."; return; }
        if (extOf(path) === "json") { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {} }
        if (text.length > PREVIEW) text = text.slice(0, PREVIEW) + "\n\n… (cut here: the file is longer)";
        this.text = text;
        if (!isMarkdown(path)) {
          if (this.code) this.code.set_value(text);
          else {
            const tm = theme(), ext = extOf(path);
            this.code = EditorState.new({ language: LANG[ext] ?? (ext || "txt"), value: text, readonly: true, soft_wrap: true, folding: true,
              font_family: settings().font_family,
              syntax: { keyword: tm.ansi5, string: tm.ansi2, comment: tm.dim, function: tm.ansi4, type: tm.ansi3, number: tm.ansi1, constant: tm.ansi6 } });
          }
        }
      } catch (e) { if (this.file === path) this.fileError = `Cannot read this file: ${String(e?.message ?? e)}`; }
      finally { cx.notify(); }
    });
  }

  // Copies a picture from the task's machine to this Mac (base64 through hc, so
  // the bytes arrive whole), then shows the copy. A changed file gets a new name.
  fetchImage(path, entry, cx) {
    if ((entry?.size ?? 0) > REMOTE_IMAGE) { this.fileError = `Too large to copy over for a preview (${fmtSize(entry.size)}). Open it on ${this.machine}.`; return; }
    const dir = previewDir(this.id);
    const out = `${dir}/${entry?.at ?? 0}-${path.replace(/[\/\\]/g, "__")}`;
    if (this.remote?.path === path && this.remote.out === out) return;
    this.remote = { path, out, ready: false };
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", 'mkdir -p "$1" && hc exec --on "$2" --timeout 120 sh -c \'base64 < "$1"\' sh "$3" > "$4.b64" && base64 --decode < "$4.b64" > "$4.part" && [ -s "$4.part" ] && mv -f "$4.part" "$4"; c=$?; rm -f "$4.b64" "$4.part"; exit $c',
          "sh", dir, this.machine, `${this.root}/${path}`, out], { timeout: 150000 });
        if (r.code !== 0) throw new Error((r.stderr || "the copy failed").trim().split("\n")[0]);
        if (this.remote?.out === out) this.remote.ready = true;
      } catch (e) { if (this.file === path) this.fileError = `Cannot copy this picture from ${this.machine}: ${String(e?.message ?? e)}`; }
      finally { cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.open.has(path)) this.open.delete(path); else this.open.add(path);
    cx.notify();
  }

  // Up and down move through the visible files; left and right fold folders.
  key(e, cx) {
    if (e.key === "escape") { this.close(); cx.stop_propagation(); return; }
    const rows = this.visible();
    const at = rows.findIndex((r) => r.path === this.file);
    const go = (i) => { const r = rows[Math.max(0, Math.min(rows.length - 1, i))]; if (!r) return; if (r.dir) { this.file = r.path; this.code?.release(); this.code = null; this.text = null; this.fileError = ""; cx.notify(); } else this.show(r.path, cx); };
    if (e.key === "down") { go(at + 1); cx.stop_propagation(); }
    else if (e.key === "up") { go(at - 1); cx.stop_propagation(); }
    else if ((e.key === "right" || e.key === "left") && rows[at]?.dir) {
      if ((e.key === "right") !== this.open.has(rows[at].path)) this.toggle(rows[at].path, cx);
      cx.stop_propagation();
    }
  }

  visible(prefix = "", out = []) {
    for (const e of this.kids.get(prefix) ?? []) {
      out.push(e);
      if (e.dir && this.open.has(e.path)) this.visible(e.path, out);
    }
    return out;
  }

  tree(tm) {
    const rows = [];
    const walk = (prefix, depth) => {
      for (const e of this.kids.get(prefix) ?? []) {
        const open = this.open.has(e.path), on = this.file === e.path;
        rows.push(h_flex().id(`tf-${e.path}`).h(26).flex_none().pl(6 + depth * 14).pr(8).gap(6).items_center().rounded(6).cursor_pointer()
          .when(on, (el) => el.bg(tm.selected))
          .when(!on, (el) => el.hover((s) => s.bg(tm.hover)))
          .on_click((_e, cx) => e.dir ? this.toggle(e.path, cx) : this.show(e.path, cx))
          .child(e.dir ? svg(icon(open ? "chevron-down" : "chevron-right")).size(11).flex_none().text_color(tm.dim) : div().w(11).flex_none())
          .child(e.dir ? svg(icon("folder")).size(13).flex_none().text_color(tm.muted)
            : (([ic, color]) => svg(icon(ic)).size(13).flex_none().text_color(tm[color] ?? tm.dim))(fileType(e.path)))
          .child(div().flex_1().min_w(0).truncate().text_color(on ? tm.foreground : tm.muted).child(nameOf(e.path)))
          .when(e.dir, (el) => el.child(div().flex_none().text_size(10.5).text_color(tm.dim).child(String(this.kids.get(e.path)?.length ?? 0)))));
        if (e.dir && open) walk(e.path, depth + 1);
      }
    };
    walk("", 0);
    return rows;
  }

  preview(tm) {
    const path = this.file;
    const entry = path ? this.entries.find((e) => e.path === path) : null;
    const local = !this.machine;
    const abs = path ? `${this.root}/${path}` : null;
    const head = h_flex().h(34).flex_none().px(12).gap(8).items_center().border_b(1).border_color(tm.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(tm.foreground).child(path ?? ""))
      .when(Boolean(entry) && !entry.dir, (el) => el.child(div().flex_none().text_size(11).text_color(tm.dim).child(fmtSize(entry.size))))
      .when(Boolean(entry) && local, (el) => el.child(tiny("tf-open", entry.dir ? "Open folder" : "Open", () => { openFile(abs).catch(() => {}); })));
    let body;
    if (!path) body = div().p(16).text_size(12).text_color(tm.dim).child(this.loading ? "Loading…" : "Choose a file on the left.");
    else if (entry?.dir) body = div().p(16).text_size(12).text_color(tm.dim).child(`${this.kids.get(path)?.length ?? 0} items. Choose a file on the left.`);
    else if (this.fileError) body = div().p(16).text_size(12).text_color(tm.dim).child(this.fileError);
    else if (isImage(path)) {
      const src = local ? abs : this.remote?.path === path && this.remote.ready ? this.remote.out : null;
      body = src
        ? div().id("tf-img").flex_1().min_h(0).p(12).flex().items_center().justify_center().overflow_hidden().child(image(imagePath(src)).size_full())
        : div().p(16).text_size(12).text_color(tm.dim).child(`Copying the picture from ${this.machine}…`);
    }
    else if (this.text === null || this.text === undefined) body = div().p(16).text_size(12).text_color(tm.dim).child("Reading…");
    else if (isMarkdown(path)) body = v_flex().id("tf-md").flex_1().min_h(0).overflow_y_scrollbar().px(18).py(12)
      .child(TextView.markdown(`tf-md-${path}-${this.fileAt ?? 0}`, this.text).selectable(true).scrollable(false));
    else if (this.code) body = div().flex_1().min_h(0).child(Editor.new(this.code).size_full());
    else body = div().p(16).text_size(12).text_color(tm.dim).child("Reading…");
    return v_flex().flex_1().min_w(0).min_h(0).rounded(8).border_1().border_color(tm.border).bg(tm.background).overflow_hidden()
      .child(head).child(body);
  }

  render(cx) {
    const tm = theme();
    const t = task(this.id);
    const where = `${this.machine ? `${this.machine}:` : ""}${this.root ?? ""}`;
    return v_flex().id("files-view").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(10).bg(tm.popover).text_color(tm.foreground).text_size(12.5)
      .child(titleRow(`Files · ${t?.title ?? "task"}`, h_flex().items_center().gap(6)
        .when(!this.machine && Boolean(this.root), (el) => el.child(tiny("tf-reveal", "Open in Finder", () => { openFile(this.root).catch(() => {}); })))
        .child(closeButton("close", () => this.close()))))
      .child(div().text_size(11).text_color(tm.dim).truncate().child(where))
      .child(h_flex().flex_1().min_h(0).gap(10).items_start()
        .child(v_flex().id("tf-tree").w(270).flex_none().h_full().overflow_y_scrollbar().p(4).rounded(8).border_1().border_color(tm.border).bg(tm.surface).text_size(12)
          .children(this.tree(tm))
          .when(Boolean(this.error) || (!this.loading && !this.entries.length), (el) => el.child(div().p(8).text_size(12).text_color(this.error ? tm.blocked : tm.dim).child(this.error || "This folder is empty."))))
        .child(v_flex().flex_1().min_w(0).h_full().child(this.preview(tm))));
  }
}
