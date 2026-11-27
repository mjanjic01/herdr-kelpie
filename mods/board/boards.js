// The Boards window: every board on every machine, where each one is open,
// its team and tasks, and whether its folder still exists. Show or open a
// board's space, change its team, or remove it with its tasks and their
// worktrees (branches stay). An engine forgets an empty
// board by itself a minute after its folder goes; one with tasks waits here.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, home, notify, panes, exec } from "herdr";
import { MOD, COLUMNS, served, stateOf, tasks, activeRun, spaces, qual, request, teamsOf } from "./state.js";
import { tiny, chips, section, titleRow, closeButton, dot } from "./ui.js";

const short = (folder) => { const h = home(); return h && folder.startsWith(h + "/") ? `~${folder.slice(h.length)}` : folder; };
const base = (p) => p.split("/").pop() || p;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const removeLabel = (tasks, wts) => !tasks ? "Remove board" : wts ? `Remove board, ${plural(tasks, "task")} and ${plural(wts, "worktree")}` : `Remove board and ${plural(tasks, "task")}`;

// ---- the task worktrees a board removal takes with it ----
// The engine's board-remove keeps them; the window removes them first, on the
// board's machine. Their branches stay.
async function git(machine, cwd, args) {
  const r = await exec("git", args, { cwd, on: machine, timeout: 120000 });
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
}
// Each task worktree that is still on disk: { path, repo, branch, dirty }.
async function worktreesOf(machine, mine) {
  const out = [];
  for (const t of mine) {
    const wt = t.worktree;
    if (!wt?.path) continue;
    const here = await exec("test", ["-d", wt.path], { on: machine }).then((r) => r.code === 0, () => false);
    if (!here) continue;
    let dirty = false;
    try { dirty = (await git(machine, wt.path, ["--no-optional-locks", "status", "--porcelain"])).out !== ""; } catch {}
    out.push({ path: wt.path, repo: wt.repo ?? null, branch: wt.branch ?? null, dirty });
  }
  return out;
}
// Removes one worktree, changes and locks included. Returns an error or null.
async function dropWorktree(machine, wt) {
  let last = null;
  for (const cwd of [wt.repo, wt.path].filter(Boolean)) {
    let r;
    try { r = await git(machine, cwd, ["worktree", "remove", "-f", "-f", wt.path]); } catch (e) { last = String(e?.message ?? e); continue; }
    if (r.ok || /is not a working tree|does not exist/.test(r.err)) return null;
    last = r.err || "git worktree remove failed.";
  }
  return last;
}

export class BoardsView extends View {
  init(_props, cx) {
    this.confirm = null; // the board key whose Remove asks again
    this.busy = null;    // the board key with a request on its way
    this.error = "";
    this.removed = new Set(); // board keys removed here: hidden before the engine's next state
    // Opened from the Teams window: only that team's boards, on its machine.
    const p = props() ?? {};
    this.only = p.team ? { machine: p.machine ?? null, team: p.team } : null;
  }

  // A request about one board; its error shows under the list.
  op(cx, machine, key, body, done, failed) {
    this.busy = key;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try { await request(machine, body); done?.(); }
      catch (e) { this.error = String(e?.message ?? e); failed?.(); }
      this.busy = null;
      cx.notify();
    });
  }

  row(machine, b) {
    const tm = theme();
    const key = `${machine ?? ""}:${b.id}`;
    const st = stateOf(machine);
    const mine = tasks().filter((t) => (t.machine ?? null) === machine && t.board === b.id);
    const running = mine.filter((t) => activeRun(t)).length;
    const counts = COLUMNS.map((c) => [c.name, mine.filter((t) => t.column === c.id).length]).filter(([, n]) => n);
    const all = spaces();
    const open = Object.entries(st?.spaces ?? {}).filter(([, v]) => !v.taskWorktree && v.board === b.id)
      .map(([sid]) => all.find((s) => s.id === qual(machine, sid))).filter(Boolean);
    const gone = b.missing != null;
    const teams = teamsOf(machine);
    const status = gone ? [tm.blocked, "folder gone"] : open.length ? [tm.working, `open in ${open.map((s) => s.name).join(", ")}`] : [tm.dim, "not open"];
    const asking = this.confirm === key;
    const busy = this.busy === key;
    const check = asking && this.check?.key === key ? this.check : null; // null: still looking
    const ask = (cx) => {
      this.confirm = key;
      this.check = null;
      this.error = "";
      cx.notify();
      cx.spawn(async (cx) => {
        let wts = [];
        let error = null;
        try { wts = await worktreesOf(machine, mine); } catch (e) { error = String(e?.message ?? e); }
        if (this.confirm === key) this.check = { key, wts, error };
        cx.notify();
      });
    };
    const remove = (cx) => {
      const wts = check?.wts ?? [];
      // First the board panes of the spaces that show it: an open board view
      // would save the board again at once.
      for (const s of open) {
        const all = panes();
        for (const p of all.filter((p) => p.mod === MOD && s.tabs.some((t) => t.id === p.tab))) {
          const alone = all.filter((x) => x.tab === p.tab).length === 1;
          if (!alone) run("pane.close", { pane: p.pane });
          else if (s.tabs.length > 1) run("tab.close", { id: p.tab, confirmed: true });
        }
      }
      // Spaces in a task worktree ("Unblock in tab" makes them) close with it.
      const inside = (f) => wts.some((w) => f === w.path || String(f ?? "").startsWith(w.path + "/"));
      for (const s of spaces().filter((s) => (s.machine ?? null) === machine && inside(s.folder))) run("space.close", { id: s.id, confirmed: true });
      this.busy = key;
      this.error = "";
      cx.notify();
      cx.spawn(async (cx) => {
        // The worktrees first: once the tasks are gone, so are their paths.
        const failed = [];
        for (const [i, w] of wts.entries()) {
          this.progress = `Removing worktree ${i + 1} of ${wts.length}…`;
          cx.notify();
          const err = await dropWorktree(machine, w);
          if (err) failed.push(`${base(w.path)}: ${err}`);
        }
        this.progress = null;
        if (failed.length) {
          this.error = `The board stays: ${failed.length} worktree${failed.length === 1 ? "" : "s"} could not be removed. ${failed.join(" · ")}`;
          this.busy = null;
          this.confirm = null;
          return cx.notify();
        }
        this.removed.add(key);
        this.confirm = null;
        cx.notify();
        try {
          await request(machine, { op: "board-remove", board: b.id, tasks: mine.length > 0 });
          if (wts.length) notify({ title: `Board removed: ${base(b.folder)}`, body: `${mine.length} task${mine.length === 1 ? "" : "s"} and ${wts.length} worktree${wts.length === 1 ? "" : "s"} removed. Their branches stay.`, timeout: 6000 });
        } catch (e) { this.error = String(e?.message ?? e); this.removed.delete(key); }
        this.busy = null;
        cx.notify();
      });
    };
    const dirty = (check?.wts ?? []).filter((w) => w.dirty);
    return v_flex().id(`brow-${key}`).gap(5).px(12).py(10).rounded(8).border_1().border_color(gone ? tm.blocked : tm.border).bg(tm.raised)
      .child(h_flex().items_center().gap(8)
        .child(div().text_size(13).font_semibold().text_color(tm.foreground).child(b.folder.split("/").pop() || b.folder))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(tm.dim).child(short(b.folder)))
        .when(open.length > 0, (el) => el.child(tiny(`bshow-${key}`, "Show", () => run("space.select", { id: open[0].id }))))
        .when(!open.length && !gone, (el) => el.child(tiny(`bopen-${key}`, "Open space", () => run("space.new", { folder: b.folder, machine: machine ?? "" }))))
        .child(asking
          ? h_flex().gap(4).child(tiny(`bno-${key}`, "Keep", (_e, cx) => { this.confirm = null; cx.notify(); }))
            .child(tiny(`byes-${key}`, busy ? (this.progress ?? "Removing…") : !check ? "Checking…" : removeLabel(mine.length, check.wts.length), (_e, cx) => remove(cx), { danger: true, disabled: busy || !check || Boolean(check.error) }))
          : tiny(`brm-${key}`, "Remove…", (_e, cx) => ask(cx), { danger: true, disabled: running > 0 || busy })))
      .child(h_flex().items_center().gap(6).text_size(11.5)
        .child(dot(status[0], 7))
        .child(div().text_color(gone ? tm.blocked : tm.muted).child(status[1]))
        .child(div().text_color(tm.dim).child("·"))
        .child(div().text_color(tm.muted).child(counts.length ? counts.map(([n, c]) => `${c} ${n}`).join(" · ") : "no tasks"))
        .when(running > 0, (el) => el.child(div().text_color(tm.working).child(`· ${running} running`))))
      .when(teams.length > 1, (el) => el.child(h_flex().items_center().gap(8).pt(2)
        .child(div().text_size(10.5).text_color(tm.dim).child("TEAM"))
        .child(chips(`bteam-${key}`, teams.map((t) => ({ id: t.id, label: t.name })), b.team ?? "", (id, cx) => this.op(cx, machine, key, { op: "board-set", board: b.id, team: id })))))
      .when(teams.length <= 1, (el) => el.child(div().text_size(11).text_color(tm.dim).child(`team ${teams.find((t) => t.id === b.team)?.name ?? "none"}`)))
      .when(running > 0 && !asking, (el) => el.child(div().text_size(11).text_color(tm.dim).child("Stop its runs to remove it.")))
      .when(asking && mine.length > 0, (el) => el.child(div().text_size(11).text_color(tm.blocked).child(
        !check ? "Its tasks go too. Looking for their worktrees…"
          : check.error ? `Could not check the task worktrees: ${check.error}`
          : check.wts.length ? `Its tasks and their ${check.wts.length} worktree${check.wts.length === 1 ? "" : "s"} go too. Their branches stay.`
          : "Its tasks go too. They have no worktrees left.")))
      .when(asking && dirty.length > 0, (el) => el.child(div().text_size(11).text_color(tm.blocked).child(
        `Uncommitted changes will be lost in: ${dirty.map((w) => base(w.path)).join(", ")}`)))
      .when(asking, (el) => el.child(div().text_size(11).text_color(tm.dim).child(open.length
        ? "Its settings, notes and standing rule go. It is open in a space, so it comes back there as a new board with the default settings. Close the space first to remove it for good."
        : "Its settings, notes and standing rule go.")));
  }

  render(cx) {
    const tm = theme();
    const only = this.only;
    const machines = served().filter((m) => stateOf(m) && (!only || m === only.machine));
    const teamName = only ? teamsOf(only.machine).find((t) => t.id === only.team)?.name ?? "this team" : null;
    return v_flex().id("boards-root").size_full().p(20).bg(tm.popover).text_color(tm.foreground)
      .child(titleRow(only ? `Boards that use ${teamName}` : "Boards", closeButton("boards-close", () => closeOverlay(props().overlay))))
      .child(div().pt(4).text_size(11.5).text_color(tm.dim).child(only
        ? `Teams belong to one machine: ${teamName} on ${only.machine ?? "this Mac"} is not the team of the same name on another machine.`
        : "Each machine has its own teams. A board without tasks is forgotten a minute after its folder goes."))
      .child(v_flex().id("boards-scroll").flex_1().min_h(0).overflow_y_scrollbar().pr(4)
        .children(machines.map((m) => {
          const list = (stateOf(m)?.boards ?? []).filter((b) => (!only || b.team === only.team) && !this.removed.has(`${m ?? ""}:${b.id}`));
          return v_flex().gap(8)
            .child(section(m ?? "This Mac", div().text_size(10.5).text_color(tm.dim).child(`${list.length} board${list.length === 1 ? "" : "s"}`)))
            .children(list.length ? list.map((b) => this.row(m, b)) : [div().text_size(12).text_color(tm.dim).child("No boards.")]);
        })))
      .when(Boolean(this.error), (el) => el.child(div().pt(8).text_size(12).text_color(tm.blocked).child(this.error)));
  }
}
