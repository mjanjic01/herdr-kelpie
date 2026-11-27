// node --test mods/board/engine/engine.flow.test.mjs
//
// The engine end to end, one pass at a time (--once), on a scratch board home
// with a fake herdr-core: requests go into inbox/, and the test reads
// tasks.json and the fake core's terminals. Never a real board or core.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "engine.mjs");

// A fake `hc`: `connect` answers hello, terminal.list and doc.get (one space on
// the board's folder); `run` adds a live terminal; `kill` ends one.
const FAKE_HC = `
import fs from "node:fs";
const F = process.env.FAKE_HC_STATE;
const read = () => JSON.parse(fs.readFileSync(F, "utf8"));
const write = (s) => { fs.writeFileSync(F + ".tmp", JSON.stringify(s)); fs.renameSync(F + ".tmp", F); };
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "connect") {
  let buf = "";
  process.stdin.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      const s = read();
      const result = m.method === "terminal.list" ? { terminals: s.terminals }
        : m.method === "doc.get" ? { value: { spaces: [{ id: "s1", name: "scratch", folder: s.folder, tabs: [{ id: "tb1", root: { content: { terminal: "t0" } } }] }] } }
        : {};
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
    }
  });
} else if (cmd === "run") {
  const s = read();
  const labels = {};
  let cwd = null;
  for (let i = 0; i < rest.length && rest[i] !== "--"; i++) {
    if (rest[i] === "--label") { const [k, ...v] = rest[++i].split("="); labels[k] = v.join("="); }
    if (rest[i] === "--cwd") cwd = rest[++i];
  }
  const address = "t" + (s.terminals.length + 1);
  s.terminals.push({ address, state: "live", status: "working", labels, cwd });
  write(s);
  process.stdout.write(JSON.stringify({ address }) + "\\n");
} else if (cmd === "kill") {
  const s = read();
  for (const k of s.terminals) if (k.address === rest[0]) k.state = "exited";
  write(s);
} else process.stdout.write("{}\\n");
`;

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "board-flow-"));
  const home = path.join(root, "home");
  const folder = path.join(root, "repo");
  fs.mkdirSync(home); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(root, "fake-hc.mjs"), FAKE_HC);
  const hc = path.join(root, "hc");
  fs.writeFileSync(hc, `#!/bin/sh\nexec "${process.execPath}" "${path.join(root, "fake-hc.mjs")}" "$@"\n`, { mode: 0o755 });
  const state = path.join(root, "core.json");
  fs.writeFileSync(state, JSON.stringify({ folder, terminals: [{ address: "t0", state: "live", status: null, labels: {}, cwd: folder }] }));
  const member = (id, name, role, capacity, handoffs) => ({ id, name, role, program: "fake", model: "", color: "ansi1", capacity, handoffs, secrets: [], args: [], brief: `## ${role}\n\nYou ${role}.` });
  fs.writeFileSync(path.join(home, "teams.json"), JSON.stringify([{ id: "tm1", name: "Default", members: [
    member("planner", "Ana", "Planner", 3, ["builder"]),
    member("builder", "Bo", "Builder", 1, ["reviewer"]),
    member("reviewer", "Cy", "Reviewer", 1, ["builder"]),
  ] }]));
  // "fake" runs `true`: the engine only checks that it is installed.
  fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({ autopilot: true, niceness: 0, gatePressure: 0, gateLoad: 0, programs: { fake: { name: "Fake", run: ["true"] } }, runLimitV2: true }));
  let n = 0;
  const env = { ...process.env, FAKE_HC_STATE: state };
  const pass = () => execFileSync(process.execPath, [ENGINE, "--home", home, "--hc", hc, "--once"], { env, stdio: "pipe", timeout: 60000 });
  const core = () => JSON.parse(fs.readFileSync(state, "utf8"));
  const setStatus = (address, status) => { const s = core(); s.terminals.find((k) => k.address === address).status = status; fs.writeFileSync(state, JSON.stringify(s)); };
  const tasks = () => JSON.parse(fs.readFileSync(path.join(home, "tasks.json"), "utf8"));
  const task = (id) => tasks().find((t) => t.id === id);
  // One request, one pass; returns the engine's answer.
  const ask = (req) => {
    const name = `r${++n}.json`;
    fs.mkdirSync(path.join(home, "inbox"), { recursive: true });
    fs.writeFileSync(path.join(home, "inbox", `.${name}`), JSON.stringify({ from: "the test", ...req }));
    fs.renameSync(path.join(home, "inbox", `.${name}`), path.join(home, "inbox", name));
    pass();
    for (const box of ["done", "failed"]) {
      try { return { box, ...JSON.parse(fs.readFileSync(path.join(home, "inbox", box, name), "utf8")) }; } catch {}
    }
    return null;
  };
  const result = (t, r, res) => fs.writeFileSync(path.join(home, "tasks", t.id, `result.${r.id}.json`), JSON.stringify(res));
  // A kill is sent without waiting: give the fake core a moment.
  const killed = async (address) => {
    for (let i = 0; i < 50; i++) { if (core().terminals.find((k) => k.address === address)?.state === "exited") return true; await new Promise((r) => setTimeout(r, 100)); }
    return false;
  };
  return { root, home, folder, pass, ask, task, tasks, core, setStatus, result, killed, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// A task in doing for Bo, whose run is blocked on a question to the person.
function blockedForBo(s, title = "Decide the threshold") {
  const made = s.ask({ title, folder: s.folder, assignee: "Bo", column: "doing" });
  assert.equal(made.started, true, JSON.stringify(made));
  const t = s.task(made.id);
  const r = t.runs.at(-1);
  s.result(t, r, { action: "blocked", summary: "I can only hand off to Cy: route it to Ana." });
  // After its question, Claude stops and waits: the core says "done".
  s.setStatus(r.terminal, "done");
  s.pass();
  assert.match(s.task(t.id).attention, /^Bo needs you/);
  return { id: t.id, run: r };
}

test("assign ends the previous member's blocked run, frees the slot and starts the new assignee", async () => {
  const s = scratch();
  try {
    const { id, run } = blockedForBo(s);
    const ans = s.ask({ op: "assign", id, assignee: "Ana" });
    assert.equal(ans.box, "done", JSON.stringify(ans));
    assert.equal(ans.ended, "Bo");
    assert.equal(ans.started, true);
    const t = s.task(id);
    const old = t.runs.find((x) => x.id === run.id);
    assert.ok(old.ended);
    assert.equal(old.exit, "reassigned");
    assert.equal(t.attention, null);
    const now = t.runs.at(-1);
    assert.equal(now.member, "planner");
    assert.ok(!now.ended);
    assert.ok(await s.killed(run.terminal), "Bo's session was not ended");
  } finally { s.cleanup(); }
});

test("a run waiting for the person's answer frees its member's slot", () => {
  const s = scratch();
  try {
    blockedForBo(s);
    // Bo has capacity 1 and one blocked run: a hand-off to him starts at once.
    const other = s.ask({ title: "Second task", folder: s.folder, assignee: "Ana", column: "doing" });
    const ot = s.task(other.id);
    s.result(ot, ot.runs.at(-1), { action: "handoff", to: "Bo", summary: "Plan ready." });
    s.pass();
    const second = s.task(other.id);
    assert.equal(second.queued, false);
    assert.equal(second.runs.at(-1).member, "builder");
    assert.ok(!second.runs.at(-1).ended);
  } finally { s.cleanup(); }
});

test("a working run goes on after a reassign or a move to To do, and the answer says so", async () => {
  const s = scratch();
  try {
    const made = s.ask({ title: "Busy work", folder: s.folder, assignee: "Bo", column: "doing" });
    const r = s.task(made.id).runs.at(-1);
    const ans = s.ask({ op: "assign", id: made.id, assignee: "Ana" });
    assert.equal(ans.started, false);
    assert.match(ans.warning, /^Bo is still on it \(working\)/);
    const moved = s.ask({ op: "move", id: made.id, column: "todo" });
    assert.match(moved.warning, /^Bo is still on it \(working\)/);
    const t = s.task(made.id);
    assert.equal(t.runs.length, 1);
    assert.ok(!t.runs[0].ended);
    assert.equal(s.core().terminals.find((k) => k.address === r.terminal).state, "live");
  } finally { s.cleanup(); }
});

test("the brief lets every member hand back to the Planner for a decision", () => {
  const s = scratch();
  try {
    const made = s.ask({ title: "Build it", folder: s.folder, assignee: "Bo", column: "doing" });
    const brief = fs.readFileSync(path.join(s.home, "tasks", made.id, "brief.md"), "utf8");
    assert.match(brief, /You may hand off to: Cy \(Reviewer\), Ana \(Planner\)\./);
    assert.match(brief, /needs a decision about its plan .* hand off to Ana \(Planner\)/);
  } finally { s.cleanup(); }
});

test("a move to To do ends the run and its note; back in doing the assignee starts again", async () => {
  const s = scratch();
  try {
    const { id, run } = blockedForBo(s);
    const away = s.ask({ op: "move", id, column: "todo" });
    assert.equal(away.ended, "Bo");
    let t = s.task(id);
    assert.equal(t.runs.find((x) => x.id === run.id).exit, "moved to To do");
    assert.equal(t.attention, null);
    assert.ok(await s.killed(run.terminal));
    const back = s.ask({ op: "move", id, column: "doing" });
    assert.equal(back.started, true, JSON.stringify(back));
    t = s.task(id);
    assert.equal(t.runs.length, 2);
    assert.ok(!t.runs.at(-1).ended);
  } finally { s.cleanup(); }
});

test("a move to doing while the assignee's own run is still on it says so", () => {
  const s = scratch();
  try {
    const { id } = blockedForBo(s);
    const ans = s.ask({ op: "move", id, column: "doing" });
    assert.equal(ans.started, false);
    assert.match(ans.warning, /^Bo is still on it \(/);
  } finally { s.cleanup(); }
});

test("an update from the screen that changes the assignee hands a doing task over", async () => {
  const s = scratch();
  try {
    const { id, run } = blockedForBo(s);
    const ans = s.ask({ op: "update", id, patch: { assignee: "Ana" } });
    assert.equal(ans.box, "done", JSON.stringify(ans));
    const t = s.task(id);
    assert.equal(t.runs.find((x) => x.id === run.id).exit, "reassigned");
    assert.equal(t.runs.at(-1).member, "planner");
    assert.ok(!t.runs.at(-1).ended);
    assert.ok(await s.killed(run.terminal));
  } finally { s.cleanup(); }
});

test("a stop right after a reply does not restart the member, and a move to Backlog leaves no note", async () => {
  const s = scratch();
  try {
    const { id, run } = blockedForBo(s);
    s.ask({ op: "reply", id, text: "Park it." }); // clears the note
    const stop = s.ask({ op: "stop", id, how: "parked until the PR merges" });
    assert.equal(stop.box, "done");
    assert.ok(await s.killed(run.terminal), "a stop with a reason of its own must end the session too");
    s.pass();
    s.pass();
    let t = s.task(id);
    assert.equal(t.runs.length, 1, "the engine restarted the stopped member");
    assert.equal(t.queued, false);
    assert.equal(t.runs[0].exit, "parked until the PR merges");
    // A note left from the stopped run goes with a move to Backlog.
    s.ask({ op: "update", id, patch: { attention: "Bo needs you: old question" } });
    s.ask({ op: "move", id, column: "backlog" });
    t = s.task(id);
    assert.equal(t.attention, null);
    assert.equal(t.runs.length, 1);
    // A stopped run takes no replies.
    const reply = s.ask({ op: "reply", id, text: "Anything?" });
    assert.equal(reply.box, "failed");
  } finally { s.cleanup(); }
});
