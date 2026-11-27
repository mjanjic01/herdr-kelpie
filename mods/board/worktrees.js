// Task worktrees, removed by the screen on the task's machine. The engine's
// remove and board-remove keep them; the Boards window's Remove and the task
// dialog's Delete take them along. Their branches stay.
import { exec, run, spaces } from "herdr";

async function git(machine, cwd, args) {
  const r = await exec("git", args, { cwd, on: machine, timeout: 120000 });
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
}
// Each task worktree that is still on disk: { path, repo, branch, dirty }.
export async function worktreesOf(machine, mine) {
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
export async function dropWorktree(machine, wt) {
  let last = null;
  for (const cwd of [wt.repo, wt.path].filter(Boolean)) {
    let r;
    try { r = await git(machine, cwd, ["worktree", "remove", "-f", "-f", wt.path]); } catch (e) { last = String(e?.message ?? e); continue; }
    if (r.ok || /is not a working tree|does not exist/.test(r.err)) return null;
    last = r.err || "git worktree remove failed.";
  }
  return last;
}
// Closes the spaces whose folder is inside one of these worktrees
// ("Unblock in tab" makes them).
export function closeSpacesIn(machine, wts) {
  const inside = (f) => wts.some((w) => f === w.path || String(f ?? "").startsWith(w.path + "/"));
  for (const s of spaces().filter((s) => (s.machine ?? null) === machine && inside(s.folder))) run("space.close", { id: s.id, confirmed: true });
}
