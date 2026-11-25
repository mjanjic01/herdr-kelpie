# Kelpie

Kelpie is a software factory for coding agents in Herdr: a kanban board where teams of agents plan, build, review and test the work. Each checkout (a repository or a worktree folder) has its own board with five columns. A team of agents works the tasks. Each member has a name, a role, a brief and a program: any coding agent that Herdr can start. A member writes a result file to hand a task to the next member, or to report done or blocked. A small engine on each Mac runs the agents, so the board keeps working while the Herdr app is closed.

![Kelpie](preview.png)

## What you see

- **Header (46 px):**
  - "Board", the space's name and the board's team.
  - The task count, "N working" with a spinner, and "N needs you" with a red dot.
  - On the right: the "Autopilot on ▾" menu button, a chip for each member and "+ Task".
  - If the board is a window, "Dock as tab" and ✕ follow.
- **Five columns:** Backlog, To do, In progress, Review, Done. Each has a task count, and Backlog and To do each have a + button. The columns share the width (each at least 170 px) and scroll on their own.
- **Cards (rounded 8 px, surface background),** newest change first. A card shows:
  - The title, and the run's status on the right: "working" with a spinner, "needs you" with a red dot, "finished", "idle", or "usage limit".
  - The member chip with the program icon and the model.
  - If the task has its own worktree: "⎇ <branch>".
  - A wait line: "Waits for Bo, who works on "<title>"", or "Waits for the usage limit to reset at 10pm".
  - If its dependencies are not in Review or Done: "Waits for "<title>" (In progress)" or "Waits for 2 tasks: …".
  - If the task needs the person: a red note and a red border.
  - "N runs · 2h". If the task needs the person, "Unblock ↗" follows. If the task has an assignee and no run, "▶ Start" follows.
  - On the right of that row, if the task has pull requests: a GitHub mark (`github.svg`, 11 px) and "#<number>" for each, green when open, muted when draft, ANSI magenta when merged, dim and struck through when closed. Hover shows the state; a click opens the PR in the browser and does not open the card. The engine finds them (below).
- **Task dialog:**
  - The title, then (once the task has a folder) a folder icon that opens the Files dialog, and ✕.
  - The status and the column chip, then the member, the program and the model. On the right, the task id in a monospace chip: the text can be selected, and a click on the chip copies it ("copy" turns to "copied").
  - The description, rendered as markdown, with Copy and Source.
  - Depends on: each dependency with its column, a green dot for Review or Done and a red one otherwise; a click opens it. The edit form has a picker of the board's other tasks (with a filter, without tasks that would make a loop).
  - Pull requests: each GitHub PR linked in the description, the history or the results, as "#<number> <title>" with Draft, Open, Merged or Closed, from `gh pr view --json number,title,state,isDraft` (refreshed every minute). A click opens it.
  - Attachments: a thumbnail for each image on this Mac, a file chip for the rest.
- **Files dialog** (`props: { view: "files", id, file? }`, 1080 × 760): the task folder (`tasks/<id>/`) as a tree on the left (270 px; folders first, folders with 12 entries or fewer open; each file with an icon and color by its type: `ft-*.svg`) and the chosen file on the right: markdown rendered, JSON pretty-printed in a read-only code view, other text as code, images fitted. An image on another machine is copied through `hc exec` (base64) into `board/cache/previews/<id>/` here and drawn from there (up to 15 MB); the folder is deleted when the dialog closes. It opens on `file` when given, else `brief.md`, else `PLAN.md`, else the newest markdown file. Every 5 seconds it lists the folder again and reloads the shown file if it changed. Up and down move through the tree, left and right fold, Esc closes. "Open" and "Open in Finder" are there for a folder on this Mac.
  - Runs: the task folder, and the worktree branch and path. Each run shows its member, start time, status and result, with Peek, "Open as tab" and Stop.
  - History, newest first.
  - The actions: "Unblock in tab ↗" (only when the task needs the person), Start, Restart, Nudge, Assign ▾, the column ▾, Edit, Close finished runs, and Delete.
- **Settings menu ("Autopilot on ▾"):**
  - The switches Autopilot, Pick up, Worktrees and Tabs, each with its own hint line.
  - "Run limit: 20" with − and +.
  - A TEAM list with a check next to this board's team, then "Board setup and notes…", "Teams…", "Boards…" and "Machine…".
- **Teams window:**
  - A machine picker, the team chips with member counts, "+ New team", and Rename, Duplicate, "Copy a member in…", "Copy to machine…" and Delete. Delete is turned off while a board uses the team. Next to Delete, "1 board uses it ›" or "2 boards use it ›" ("no board uses it" at 0) opens the Boards window for this team on this machine.
  - The member list, and the member form:
    - Name and Role.
    - The program chips.
    - Model.
    - Extra arguments.
    - Tasks at once.
    - Secrets: each name shows "•••• set" or "not set", with Replace and Remove.
    - A markdown brief editor whose source and preview scroll together.
    - The hand-off chips.
    - The colour dots.
- **Board setup and notes dialog:** the setup command, the environment notes, the standing answers, and "Browsers per test run" (the board's `workers`, with the hint that it is not how many agents work at once).
- **Boards window (760×620):** "Boards" from the settings menu lists every board on every machine, grouped by machine, with the board count per machine. Opened from the Teams window, it is "Boards that use <team>" and lists only that team's boards on that team's machine; a line says that a team belongs to one machine. Each board is a rounded card (red border when its folder is gone):
  - The folder's last part, the full path dimmed (`~` for home), and the buttons Show (the board is open in a space), "Open space" (not open, folder there) and "Remove…".
  - A status dot and line: "open in <space names>" (working colour), "not open" (dim) or "folder gone" (blocked colour). Then the task counts per column ("2 In progress · 1 Done", or "no tasks") and "· N running".
  - The team: chips to change it when the machine has more than one team, else "team <name>".
  - "Remove…" turns into Keep and "Remove board" (or "Remove board and N tasks"), with a line that the board's settings, notes and standing answers go. If a space shows the board, the line says that it comes back there as a new board with the defaults; close the space first. With tasks, a red line says that their worktrees and branches stay. Remove is turned off while a task of the board runs ("Stop its runs to remove it.").
- **Machine window (860×700):** a machine picker, then:
  - "Last hour": three rows of 120 columns (30 s each, the max of the samples in it), drawn with divs: load per core with a red line at the gate's factor, memory pressure as green/amber/red bands (the theme's ansi2, ansi3 and blocked), and swap used with a line at the swap gate when set. Columns where the gate was closed are shaded red. The current value sits next to each row label, and -60m, -30m and now are under the rows.
  - "Now": "Gate open" or "Gate closed: load 22.9 on 11 cores since 13:47", each browser slot with the task holding it (a click opens the task) or "free", and the tasks waiting for the gate or a slot.
  - "Settings for this machine": agent priority (0 to 19), browser slots, run limit, load gate (× cores, 0 off), memory pressure gate (Off, Warning, Critical) and swap gate (%, 0 off), saved with `set-settings`.

## How it behaves

- **Agent status** comes from the agent's own reports (OSC 7501), through herdr-core:
  - **working:** a spinner on the card and in the header count.
  - **blocked:** "needs you" with a red dot. The card says "X is waiting for you in its terminal (a question or a permission). Peek to answer." A toast and the blocked sound come once per change, for runs without a pane.
  - **done** or **idle:** "finished" or "idle".
  - **A usage limit:** "usage limit", with the reset time.
- **Hand-offs:**
  - A member finishes by writing `result.<run>.json` in the task folder: `{"action": "handoff" | "done" | "blocked", "to": "<name>", "summary": "..."}`.
  - **handoff:** the task moves to the next member. With Autopilot on, the engine starts that member at once.
  - **done:** the task moves to Review.
  - **blocked:** the card shows the question, and the agent waits in its terminal for the answer.
- **Starting a task:** dragging a card into In progress, pressing Start, or a hand-off starts the assignee. The agent gets a `brief.md` in the task folder: the member's brief, the team, the task, the history, the environment notes, the standing answers, the secret names and how to finish.
- **Capacity ("tasks at once"):** counts per board. A hand-off to a member without room waits, and the card says for which task.
- **Pick up** (per board, off by default): members with room take To do tasks, oldest first. A task without an assignee goes to the first member. A task with a note is skipped until the person clears it.
- **Worktrees** (per board, on by default): the first run of a task in a git repository gets its own worktree, at `~/.herdr/worktrees/<repo>/board-<slug>-<id>` on branch `board/<slug>-<id>`. The branch starts from `origin`'s default branch. Every member of that task works there. "Remove worktree" uses `git worktree remove`. If the worktree has changes, git refuses. A folder that is not a git repository runs one task at a time.
- **Usage limits:** if a run hits a usage limit, the engine starts nothing on that machine until 5 minutes after the reset time. Waiting cards say so.
- **Stall checks:**
  - "X has not started" after 60 s without a status.
  - "X stopped without writing a result" after 30 s idle.
  - Neither appears while the agent still runs a command, such as a long test.
- **Dependencies:** a task's `dependsOn` lists tasks on the same board. Every start checks them (Start, a hand-off, Pick up, a move into In progress, a create in doing): until all are in Review or Done, launch refuses with "Waits for "<title>" (<column>)", a hand-off or a move waits as queued (no note), and Pick up skips the task. When they are done, the history says so once and the queued start or Pick up starts it. Inbox `create` and `update` take ids or exact titles; ids from another board and loops are refused. A deleted dependency counts as done.
- **A question answered in the terminal:** when an agent that asked through a "blocked" result stopped and then works again (you answered by Peek), the "needs you" note clears and the history says so.
- **Loop check:** if the same two members hand a task back and forth 6 times in a row, the task stops with a note. Start continues it.
- **Unblock in tab:** writes `UNBLOCK.md` into the task folder on its machine (why the task needs the person, the waiting question, the description, the team, every run and hand-off, the history, the notes files, how to read the last agent's terminal, and the inbox requests for this task: reply, start, note, update, move). Then it opens a tab running `claude --add-dir <task folder> -- "<read UNBLOCK.md…>"`. The tab goes into the space of the task's own worktree (a new space there if none is open), else into the task's space. The session summarises, asks, and acts through the inbox only after the person agrees.
- **Open as tab** (a run without a pane): for a task with its own worktree, the run's terminal is labeled `herdr.space`/`herdr.tab` for that worktree's space (a new space id if none is open), with `hc label <machine>/t7 …` run on this Mac, because a remote shell's PATH may lack `hc`. Else `terminal.keep` in the task's space.
- **Heavy jobs:**
  - Every agent starts under `/usr/bin/nice -n 10` (machine setting `niceness`), so all it starts inherits the priority.
  - `board-heavy <command…>` (installed as `<home>/bin/board-heavy`, `$BOARD_HEAVY`) takes a machine-wide slot: a symlink `<home>/heavy/slot-N` whose target is `<pid>:<task>:<run>:<start>`, created atomically; a slot whose pid is gone is taken over. While it waits it leaves `<home>/heavy/wait-<pid>`, and the card says "Waits for a browser slot (held by "<task>")". It runs the command at `nice -n 10` in the background and waits for it, so a signal frees the slot at once; the exit code is the command's. Slots: machine setting `heavySlots` (1).
  - Every agent gets `BOARD_HEAVY`, `BOARD_HOME`, `BOARD_HEAVY_SLOTS`, `BOARD_TASK`, `BOARD_RUN`, and the board's `workers` (4) as `BOARD_WORKERS`, `PLAYWRIGHT_WORKERS`, `PW_WORKERS` and `E2E_WORKERS`.
  - **Machine samples:** each load check also records a sample (load per core ×100, pressure level, swap %, gate closed, busy slots) in a ring buffer of 360 (one hour). The engine writes it with the gate, the slots and the waiting tasks to `<home>/machine.json`, apart from `state.json`, so a sample never wakes the board's poller. The Machine window reads that file every 10 s while it is open.
  - **Load gate:** at most every 10 s the engine reads `sysctl -n kern.memorystatus_vm_pressure_level vm.swapusage vm.loadavg hw.ncpu`. Pressure ≥ `gatePressure` (2, warning), or a 1-minute load over `gateLoad` × cores (1.5), closes the gate; `gateSwap` (0) is off by default. It opens after 2 calm checks. While closed, hand-offs, pick-ups and waiting starts wait ("Waits: <machine> is busy (memory)"); running work and a Start by the person are not stopped. `loadGate` is in `state.json`, and the header shows "busy (…): no new starts".
- **Run limit:** at most 20 finished runs per task (− and + in the menu). Stopped or failed runs do not count.
- **Cleanup:**
  - After a result, the engine closes the Chrome inside that agent's own process tree.
  - Idle sessions of finished runs close once the agent has been idle for 15 minutes and either the same member finished a later run of the task (only each member's newest session stays), or the task has sat in Review or Done for 30 minutes (the Machine setting "Clean up after Review"; 0 = never; the engine records `restAt` when a task enters Review or Done). Never a run shown in a tab, working or waiting for the person.
  - Pull requests for the cards: every 3 minutes (30 in Done) and in the background, the engine asks `gh pr list --head <worktree branch> --state all --json number,url,state,isDraft` in the task's worktree. Without a branch PR it uses the GitHub pull links in the description and the run summaries (`gh pr view <url>`). It keeps them as `prs: [{ number, url, state, draft }]` on the task.
  - A space shows the board of its first terminal's checkout, and the engine pins it (`pins` in `state.json`): the space keeps that board while it is open, even after its first terminal moves into a task's worktree. Pins of closed spaces go only after a successful read of the spaces.
- **Boards come and go:**
  - Each pass, the engine checks every board's folder. A missing folder marks the board `missing` (the time it was first missed) in `state.json`. After a minute missing, a board with no tasks that no open space shows is forgotten, with the toast "Board forgotten: <folder name>". It does not matter how the folder went (Herdr's Remove worktree, `git worktree remove`, `rm`). A board with tasks stays, marked, for the person.
  - Remove in the Boards window first closes the board's panes in the spaces that show it (the whole tab when the board is alone in it, never a space's last tab). Then it sends `board-remove`. The card hides at once and comes back if the engine refuses. A removal by hand posts no toast.
  - An open board view whose board has no record in its engine (new, or removed while open) saves it once with `board-set`, so the Teams and Boards windows count it.
  - The engine never makes a board for a folder that does not exist.
- **Secrets:** values go to the macOS Keychain of the team's machine, under service `herdr-board`. When a member starts, the agent gets them as environment variables, and its brief lists only the names.
- **Teams across machines:** "Copy to machine…" copies the members by value. If the name is taken, the copy gets a new name. Programs missing there get a warning.
- **Interaction:**
  - Drag a card to another column to move it, and click a card to open it.
  - Esc closes the window.
  - A drop into In progress starts the assignee.

## Built from

- **`mods/board/main.js`:** picks the view from `props().view`: none for the board, `task`, `teams`, `env`, `machine`, `boards`. It builds the view after the first state load. That load starts from `cx.timer.after(30, …)`. A view redraws when `statesGen()` moved, not on `loadStates()`'s answer. Every render runs inside `within()`, which reads each live list once per render.
- **`mods/board/state.js`:** the screen's client.
  - **Reading:** `loadStates()` reads each engine's `state.json` into one module-level cache, shared by every copy of the mod, and moves `statesGen()` on each new read. Remote states come through a copy in `board/cache/<machine>.json`. Shared state holds only `boardx.seqs`, a version string per machine.
  - **Writing:** `request()` writes `<home>/inbox/.<name>.tmp` and renames it to `<name>.json`. An overlay in `boardx.pending` shows the change until the engine lists the request in `applied`.
  - **Ids:** `qual()` and `local()` map ids between the app and an engine (`<machine>/t7` and `t7`).
  - **Engines:** `ensureEngine()` installs the engine and keeps it current.
  - **Secrets:** `secretSet()` and `secretStatus()`.
- **`mods/board/board.js`:** the board view, cards, drag and drop, and the header with its `Popover` settings menu. `props().menu` opens the menu at start. One copy leads, through `board/screen-leader.json`: it polls the engines every 2 s and checks their version once a minute.
- **`mods/board/task.js`, `mods/board/team.js`, `mods/board/env.js`, `mods/board/machine.js`, `mods/board/boards.js`:** the task dialog, the Teams window, the board setup dialog, the Machine window and the Boards window; `mods/board/files.js` is the Files dialog (`props: { view: "boards", machine?, team? }`; with a team it shows only that team's boards).
- **`mods/board/mdeditor.js` and `mods/board/mdsync.js`:** the markdown editor whose source and preview scroll together. `mods/board/textblock.js`, `mods/board/note.js`, `mods/board/limit.js` and `mods/board/ui.js` hold the shared pieces.
- **`mods/board/engine/engine.mjs`:** one Node file with no dependencies, the engine.
  - **Where it runs:** the launchd user agent `dev.herdr.board` (KeepAlive) runs it on each Mac. Its home is `~/.config/herdr-app/board` on the Mac with the app and `~/.herdr/board` on others. It is the only writer of `tasks.json`, `boards.json`, `teams.json` and `settings.json`.
  - **One pass every 2 s, and at once after an inbox change.** A pass reads the world, applies the requests and reads the results. Then it reconciles runs and checks limits, alerts and stalls. Last, it closes browsers, runs setup commands, checks branches, starts waiting work, closes idle sessions and saves.
  - **Its view of the world:** spaces and folders from `hc connect` → `doc.get {name: "herdr-app"}`, and terminals from `terminal.list`.
  - **Starting agents:** `hc run --bg --no-parent --cwd <worktree> --label board.task=… -- <login shell> -lic 'unset <leaked Claude vars>; <secret exports>"$@"; …' claude --model … --add-dir <task folder> -- "<first message>"`.
  - **Inbox ops:** create, note, assign, move, update, remove, start, stop, nudge, reply, tidy, remove-worktree, board-set, board-remove, team-create, team-rename, team-duplicate, team-delete, team-set-members, team-copy-member, team-import, set-settings, import. `board-remove {board: <id>, tasks?: true}` takes the id (a gone folder cannot be named by path), refuses while the board has tasks unless `tasks` is set, and always refuses while one of them runs; the tasks' worktrees and branches stay.
  - **Boards whose folder is gone:** `checkFolders()` in each pass keeps `goneSince` (in memory) and publishes it as `missing` on each board. `staleBoards(boards, tasks, spaceBoards, goneSince, now)` (exported, tested) picks the boards to forget after `GONE_MS` (60 s). `forgetBoard()` also drops the board's space pins.
  - **Secrets socket:** `<home>/secrets.sock`, mode 0600. It answers get (a one-time token from a start, valid 2 minutes), status, set (the value on stdin) and delete.
- **`mods/board/engine/README.md` and `mods/board/engine/SKILL.md`:** the guide for agents outside the board, installed next to each engine, and the Claude Code skill `herdr-board`.
- **herdr functions:** `spaces`, `panes`, `machines`, `home`, `shared`, `setShared`, `exec`, `readTextFile`, `appHome`, `knownAgents`, `notify`, `run`, `focused`, `props`, `openOverlay`, `closeOverlay`, `theme`, `settings`, `window`, `playSound`.
- **Commands:** `tab.new`, `tab.select`, `tab.rename`, `tab.close`, `space.new`, `space.select`, `pane.focus`, `pane.close`, `terminal.peek`.
- **Programs:** `hc`, `node`, `git`, `security`, `launchctl`, `ps`, `sh` and your login shell, `claude` or `codex`.

## Watch out

- **macOS, or Linux with systemd.** The engine needs launchd and the Keychain on a Mac. On Linux it runs as a systemd user unit and keeps secrets through `secret-tool` (LINUX.md).
- **Use hidden or underscore names for scratch files.** Every save in the mod folder reloads every copy of the mod. After many reloads or long uptime, Herdr's JS engine slows down (rquickjs JIT upkeep): renders take seconds, and Herdr stops them with "could not be re-rendered". Restarting Herdr fixes it.
- **Start the first load from a timer.** An async load spawned straight from a dialog's `init` never finishes in Herdr 0.1.10, which is why the first load uses `cx.timer.after`. Calling `cx.notify()` during `init` also leaves a dialog blank.
- **Keep large data out of shared state.** Every `shared()` read copies the whole value, and every write redraws every mod. The engine states (hundreds of KB) stay in each view's memory, and shared state carries only versions.
- **Put `--` after `--add-dir`.** Claude's `--add-dir` takes several folders. Without `--` after it, the first message counts as a folder, and the agent starts empty.
- **Never let `hc` start herdr-core from inside a Claude Code session.** The core would keep that session's variables (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, its session id and messaging socket), and every new terminal would inherit them. Claude then stops saving transcripts. The engine unsets these variables before every start, but restart a leaked core through launchd.
- **Start programs on another machine through the login shell.** Herdr's `tab.new` and `knownAgents({ on })` use a plain `sh` there, whose PATH is only `/usr/bin:/bin:/usr/sbin:/sbin`, so `claude` from Homebrew or nvm is "not found". Wrap the argv: `sh -c 's=${SHELL:-/bin/zsh}; "$s" -lic '"'"'"$@"'"'"' "$s" "$@"; exec "$s" -li' sh claude …`.
- **Buttons on a card must stop their press.** A card starts a drag on mouse down. A button that opens a tab never lets the card see the release, so the card would follow the pointer later. Every button stops `on_mouse_down`.
- **Give Codex members a writable sandbox.** Started without flags, Codex runs an agent read-only and quits with "Ignoring --add-dir … because the effective permissions do not allow additional writable roots". Add `--sandbox workspace-write --ask-for-approval never -c sandbox_workspace_write.network_access=true` unless the member's own arguments set a policy. With "never", every MCP tool call is refused unless its server has `default_tools_approval_mode = "approve"` in `~/.codex/config.toml`.
- **Expect a trust question in every new worktree.** Each one is a new folder for Claude, so Claude asks whether to trust it. Trusting a parent folder does not cover it. The card shows the wait.
- **Handle Keychain values in the engine.** The Keychain opens only inside the login session. herdr-core started over ssh cannot read it, so the engine (launchd, inside the session) hands values over through its socket. While a Mac's screen is locked, stored values still read, but new ones cannot be written (-60008, "Unable to obtain authorization"): set secrets while someone is signed in there.
- **Install the skill where every agent looks.** Codex reads `~/.agents/skills/`, Claude `~/.claude/skills/`: keep one copy in the first and link the second to it, with each machine's own board path in the text.
- **Expect a restart to wait for a login.** A user launchd agent starts after a login. Without automatic login, a restarted Mac runs no engine until someone logs in.
- **Do not gate on swap.** macOS grows its swap files on demand and seldom shrinks them, so 90% or more swap in use is normal on a healthy Mac. Use the kernel's memory pressure level instead.
- **Point agents at `"$BOARD_HEAVY"`, not `board-heavy` on PATH.** The login shell, and Claude's Bash tool, may rebuild PATH from the person's profile.
- **A shell script's trap waits for a foreground child.** `board-heavy` runs the command in the background and `wait`s, so a TERM frees the slot at once.
- **Tabs mode gives runs unnamed tabs.** Herdr shows the tab's number.
- **Never act with a render's `cx`.** A button that calls `cx.spawn` or `cx.notify` with the `cx` its row got from `render` does nothing, without an error. Use the click's own `cx` (`(_e, cx) => …`).
- **Let a window read the engines when no board view does.** Only one copy reads the engines and shares what it read. Removing a board closes its board view, often the only copy reading. A Teams or Boards window opened alone would keep showing the removed board ("1 board uses it", Delete off). So every window takes the lead when no board view holds it.
- **Redraw on the shared cache, not on your own load.** Every copy of the mod shares the engine states. Often another copy (the board) reads a new state first, so a dialog's own `loadStates()` finds nothing new and the dialog shows an old list. Compare `statesGen()` instead.
- **An open board brings its board back.** The board view saves a board it shows without a record. Removing a board whose space is open only resets it, so close its board panes before `board-remove`, and say so in the confirm text.
- **Do not forget a board on one missed check.** Wait a minute, and keep boards with tasks or shown in a space: a folder can be gone for a moment (a checkout being moved), and removing a board loses its settings and standing answers.
- **Give `image()` a path relative to the app home.** It loads images from `~/.config/herdr-app`: an absolute path, even one inside it, draws nothing. Task files sit under `board/tasks/`, so strip the home prefix (`imagePath` in `state.js`). An image without a size also draws nothing: give it `size_full()` or a height.
- **Await cleanup in `close()`.** Herdr awaits what a view's `close` returns, for at most 250 ms. A delete started there and not returned is cancelled when the view goes.
- **Engine updates need an open board.** An engine update reaches a machine only while a board view is open somewhere.

- **Check the load before anything can start, and keep the gate across restarts.** The pass reads the load before it handles results (a result can start the next member at once), and a restarted engine restores a closed gate from `state.json`. Without both, a restart on a busy machine started new agents.
- **0 turns a gate rule off.** `gateLoad: 0` or `gatePressure: 0` would otherwise close the gate for good, because every value is at least 0.

## Done when

- A task that depends on one in To do refuses Start with "Waits for "<title>" (To do)", queues when moved into In progress, and starts by itself (with Autopilot on and an open space) once the dependency reaches Review.
- `herdr-app check mods/board` passes, and `node --test mods/board/engine/engine.test.mjs mods/board/*.test.js` passes.
- Opening the board (`herdr-app do mod.open --name board`) installs `dev.herdr.board` (`launchctl list | grep herdr.board`). The engine log shows `engine <version> protocol 2`.
- A fresh engine has the team "Starter" (Ana Planner, Bo Builder, Cy Reviewer).
- A task dropped into In progress starts Ana, and `brief.md` appears in its task folder. Ana's `handoff` result starts Bo in the same worktree, on branch `board/…`.
- A member that writes `blocked` shows "needs you" on its card, and the question appears in the task dialog.
- With Pick up on and capacity 1, a member takes one To do task. The next one waits until the first finishes.
- A secret set in the Teams window shows "•••• set". It reaches the agent as an environment variable, and it appears in no file under the board home.
- On a task that needs the person, "Unblock ↗" writes `UNBLOCK.md` in its task folder and opens a tab where Claude summarises the block, also for a space on another machine. Back on the board, no card follows the pointer.
- "Machine…" in the board's menu shows the last hour filling in from the right, the gate and slot state, and the machine's settings; saving changes `settings.json` on that machine.
- `sh mods/board/engine/board-heavy.test.sh` passes: the exit code passes through, a stale slot is taken over, a second job waits with a marker, TERM frees the slot. An agent's shell shows `ps -o ni` 10, and `$BOARD_WORKERS` equals the board's workers.
- With the Herdr app closed, a hand-off between two members still starts the next one.
- Make a board in a worktree, then remove the worktree with the space closed: within about a minute `boards.json` no longer lists it and the toast "Board forgotten: <name>" shows. The same with a task on the board: it stays, and the Boards window shows "folder gone".
- In the Boards window, "Remove board" on a board without tasks hides its card at once, closes its board tab, posts no toast, and `boards.json` no longer lists it. Reopening the window does not show it.
- Opening a board in a folder without a board record adds it to `boards.json` with the machine's first team, and the Teams window then says "1 board uses it ›".
