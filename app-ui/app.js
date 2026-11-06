// Sift — simple desktop UI. Talks to the local Sift engine (native-host/sift-desktop-host.mjs).

const DEFAULT_FOLDERS = [
  { path: "~/Downloads", name: "Downloads" },
  { path: "~/Desktop", name: "Desktop" },
];

const state = {
  tab: "tidy", // "tidy" | "clean" | "history"
  folders: DEFAULT_FOLDERS.map((f) => f.path),
  loading: true,
  working: false,
  plan: null,
  cleanup: null,
  history: [],
  tidyUnchecked: new Set(), // category keys the user switched off
  openCategory: null,
  cleanSelected: new Set(), // item ids ticked for the Recycle Bin
  openGroups: new Set(),
  notice: null, // { kind: "success" | "error" | "info", text, undoBatchId? }
};

// ---------- helpers ----------
async function call(command, payload = {}) {
  const res = await fetch(`/api/ipc/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.text()) || "Something went wrong.");
  return res.json();
}

function size(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function plural(n, word) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function when(unix) {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function folderName(p) {
  const known = DEFAULT_FOLDERS.find((f) => f.path === p);
  if (known) return known.name;
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

function announce(text) {
  document.getElementById("announcer").textContent = text;
}

function setNotice(kind, text, undoBatchId = null) {
  state.notice = { kind, text, undoBatchId };
  announce(text);
}

function confirmDialog(title, body, okLabel, danger = false) {
  const dlg = document.getElementById("confirm-dialog");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").textContent = body;
  const ok = document.getElementById("confirm-ok");
  const cancel = document.getElementById("confirm-cancel");
  ok.textContent = okLabel;
  ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
  return new Promise((resolve) => {
    const finish = (result) => {
      ok.onclick = cancel.onclick = dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(result);
    };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dlg.onclose = () => finish(false);
    dlg.showModal();
    ok.focus();
  });
}

// ---------- data ----------
let isInitialLaunch = true;
const splashEl = document.getElementById("splash-screen");
const splashStatusEl = document.getElementById("splash-status-text");
const splashBarEl = document.getElementById("splash-bar");

function updateSplash(text, progress = null) {
  if (splashStatusEl) splashStatusEl.textContent = text;
  if (splashBarEl && progress !== null) {
    splashBarEl.style.animation = "none";
    splashBarEl.style.left = "0";
    splashBarEl.style.width = `${progress}%`;
    splashBarEl.style.transition = "width 0.24s cubic-bezier(0.16, 1, 0.3, 1)";
  }
}

function dismissSplash() {
  if (!splashEl || splashEl.classList.contains("splash-hidden")) return;
  updateSplash("Ready", 100);
  setTimeout(() => {
    splashEl.classList.add("splash-hidden");
    setTimeout(() => {
      splashEl.style.display = "none";
    }, 550);
  }, 240);
}

async function loadAll() {
  state.loading = true;
  if (!isInitialLaunch) {
    render();
  } else {
    updateSplash("Looking through your folders…", 25);
  }
  try {
    if (isInitialLaunch) updateSplash("Scanning Downloads & Desktop…", 55);
    const [plan, cleanup, history] = await Promise.all([
      call("simulate_organize", { folders: state.folders }),
      call("scan_triage", { folders: state.folders }),
      call("get_batch_history"),
    ]);
    if (isInitialLaunch) updateSplash("Organizing file intelligence…", 88);
    state.plan = plan;
    state.cleanup = cleanup;
    state.history = history;
    const ids = new Set(cleanup.items.map((i) => i.id));
    state.cleanSelected = new Set([...state.cleanSelected].filter((id) => ids.has(id)));
  } catch (err) {
    setNotice("error", `Couldn't read your folders: ${err.message}`);
  } finally {
    state.loading = false;
    render();
    if (isInitialLaunch) {
      isInitialLaunch = false;
      dismissSplash();
    }
  }
}

function tidyItems() {
  if (!state.plan) return [];
  return state.plan.categories
    .filter((c) => !state.tidyUnchecked.has(c.category))
    .flatMap((c) => c.items)
    .filter((i) => i.status !== "alreadyThere");
}

function selectedCleanItems() {
  return (state.cleanup?.items || []).filter((i) => state.cleanSelected.has(i.id));
}

// ---------- actions ----------
async function doTidyUp() {
  const items = tidyItems();
  if (items.length === 0) return;
  const ok = await confirmDialog(
    `Move ${plural(items.length, "file")} into folders?`,
    "Nothing is deleted. You can put everything back with one click from History.",
    "Tidy Up"
  );
  if (!ok) return;

  state.working = true;
  render();
  try {
    const res = await call("execute_organize", { items });
    let text = `Done! ${plural(res.movedCount, "file")} moved into folders.`;
    if (res.failed.length > 0) {
      text += ` ${plural(res.failed.length, "file")} couldn't be moved (probably open in another app).`;
    }
    setNotice("success", text, res.movedCount > 0 ? res.batchId : null);
    state.openCategory = null;
  } catch (err) {
    setNotice("error", `Tidy Up failed: ${err.message}`);
  } finally {
    state.working = false;
  }
  await loadAll();
}

async function doCleanUp() {
  const items = selectedCleanItems();
  if (items.length === 0) return;
  const total = items.reduce((s, i) => s + i.sizeBytes, 0);
  const ok = await confirmDialog(
    `Move ${plural(items.length, "file")} to the Recycle Bin?`,
    `This frees up ${size(total)}. You can restore them from the Windows Recycle Bin if you change your mind.`,
    "Move to Recycle Bin",
    true
  );
  if (!ok) return;

  state.working = true;
  render();
  try {
    const res = await call("trash_triage_items", { items });
    setNotice("success", `Moved ${plural(res.trashedCount, "file")} to the Recycle Bin — ${size(res.reclaimedBytes)} freed.`);
    state.cleanSelected.clear();
  } catch (err) {
    setNotice("error", `Clean Up failed: ${err.message}`);
  } finally {
    state.working = false;
  }
  await loadAll();
}

async function doUndo(batchId) {
  state.working = true;
  render();
  try {
    const res = await call("revert_batch", { batchId });
    let text = `Undone — ${plural(res.restoredCount, "file")} put back where they were.`;
    if (res.failedPaths.length > 0) {
      text += ` ${plural(res.failedPaths.length, "file")} couldn't be put back (moved or renamed since).`;
    }
    setNotice("success", text);
  } catch (err) {
    setNotice("error", `Undo failed: ${err.message}`);
  } finally {
    state.working = false;
  }
  await loadAll();
}

// ---------- views ----------
function viewTopbar() {
  const tidyCount = state.plan?.totalFiles ?? 0;
  const cleanCount = state.cleanup?.totalFlaggedFiles ?? 0;
  const tab = (id, label, count) => `
    <button type="button" role="tab" class="tab" data-tab="${id}" aria-selected="${state.tab === id}">
      <span>${label}</span>
      ${count != null ? `<span class="tab-count num">${count.toLocaleString()}</span>` : ""}
    </button>`;
  return `
    <header class="topbar">
      <div class="brand">
        <img class="brand-logo" src="/sift-logo.svg" alt="Sift" width="32" height="32" />
        <div class="brand-text">
          <span class="brand-title">Sift</span>
          <span class="brand-sub">Desktop</span>
        </div>
      </div>
      <div class="tabs" role="tablist" aria-label="Sift sections">
        ${tab("tidy", "Tidy Up", state.loading ? null : tidyCount)}
        ${tab("clean", "Clean Up", state.loading ? null : cleanCount)}
        ${tab("history", "History", null)}
      </div>
    </header>`;
}

function viewFolders() {
  const custom = state.folders.filter((p) => !DEFAULT_FOLDERS.some((f) => f.path === p));
  return `
    <div class="folders">
      <span class="folders-label">Folders:</span>
      ${DEFAULT_FOLDERS.map(
        (f) => `
        <button type="button" class="chip" data-toggle-folder="${esc(f.path)}" aria-pressed="${state.folders.includes(f.path)}">
          ${state.folders.includes(f.path) ? "✓ " : ""}${esc(f.name)}
        </button>`
      ).join("")}
      ${custom
        .map(
          (p) => `
        <span class="chip" aria-pressed="true" title="${esc(p)}">
          ✓ ${esc(folderName(p))}
          <button type="button" class="chip-remove" data-remove-folder="${esc(p)}" aria-label="Stop using ${esc(folderName(p))}">✕</button>
        </span>`
        )
        .join("")}
      <button type="button" class="chip chip-add" id="add-folder">+ Add folder</button>
    </div>`;
}

function viewNotice() {
  const n = state.notice;
  if (!n) return "";
  return `
    <div class="notice ${n.kind === "success" ? "notice-success" : n.kind === "error" ? "notice-error" : ""}" role="status">
      <span>${esc(n.text)}</span>
      <span>
        ${n.undoBatchId ? `<button type="button" class="btn" data-undo="${esc(n.undoBatchId)}">Undo</button>` : ""}
        <button type="button" class="btn-link" id="dismiss-notice" aria-label="Dismiss message">✕</button>
      </span>
    </div>`;
}

function viewLoading(text) {
  return `<div class="loading"><span class="spinner" aria-hidden="true"></span><span>${esc(text)}</span></div>`;
}

function viewTidy() {
  const plan = state.plan;
  if (!plan || plan.categories.length === 0) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">✨</div>
        <h2>Everything is already tidy</h2>
        <p>There are no loose files in ${esc(state.folders.map(folderName).join(" or "))}.</p>
      </div>`;
  }

  const items = tidyItems();
  const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
  const cats = plan.categories.filter((c) => c.fileCount > 0);
  const open = cats.find((c) => c.category === state.openCategory);

  return `
    <section class="hero">
      <div>
        <h1>${plural(plan.totalFiles, "loose file")} found</h1>
        <p>Sift will sort them into folders by type, inside the folder they're already in.
           Untick anything you'd rather leave alone.</p>
      </div>
      <button type="button" class="btn btn-primary btn-big num" id="do-tidy" ${state.working || items.length === 0 ? "disabled" : ""}>
        ${state.working ? "Moving files…" : `Tidy Up ${plural(items.length, "file")}`}
      </button>
    </section>

    <div class="cards">
      ${cats
        .map((c) => {
          const checked = !state.tidyUnchecked.has(c.category);
          return `
          <div class="card">
            <label for="cat-${esc(c.category)}" class="card-top">
              <span class="card-icon" aria-hidden="true">${c.icon}</span>
              <input type="checkbox" id="cat-${esc(c.category)}" data-cat-toggle="${esc(c.category)}" ${checked ? "checked" : ""} />
            </label>
            <label for="cat-${esc(c.category)}">
              <div class="card-name">${esc(c.categoryLabel)}</div>
              <div class="card-meta num">${plural(c.fileCount, "file")} · ${size(c.totalBytes)}</div>
            </label>
            <div>
              <button type="button" class="btn-link" data-open-cat="${esc(c.category)}" aria-expanded="${state.openCategory === c.category}">
                ${state.openCategory === c.category ? "Hide files" : "See files"}
              </button>
            </div>
          </div>`;
        })
        .join("")}
    </div>

    ${open ? viewTidyFiles(open) : ""}

    ${
      plan.alreadyThere > 0
        ? `<div class="notice">${plural(plan.alreadyThere, "file")} already ${plan.alreadyThere === 1 ? "has" : "have"} an identical copy in the destination folder, so ${plan.alreadyThere === 1 ? "it'll" : "they'll"} stay put. You'll find ${plan.alreadyThere === 1 ? "it" : "them"} in Clean Up → Duplicate copies.</div>`
        : ""
    }`;
}

function viewTidyFiles(cat) {
  const items = cat.items.filter((i) => i.status !== "alreadyThere");
  const shown = items.slice(0, 200);
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>${esc(cat.categoryLabel)}</h2>
          <div class="sub">Where each file will go</div>
        </div>
      </div>
      <ul class="rows" role="list">
        ${shown
          .map(
            (i) => `
          <li class="row">
            <div class="row-main">
              <div class="row-name" title="${esc(i.sourcePath)}">${esc(i.fileName)}</div>
              <div class="row-sub">→ ${esc(i.destinationFolder)}${i.status === "renamed" ? ` (saved as “${esc(i.newFileName)}” — a different file already has that name)` : ""}</div>
            </div>
            <span class="row-size num">${size(i.sizeBytes)}</span>
            <button type="button" class="btn-link" data-reveal="${esc(i.sourcePath)}" aria-label="Show ${esc(i.fileName)} in File Explorer">Show</button>
          </li>`
          )
          .join("")}
      </ul>
      ${items.length > shown.length ? `<div class="row-more">…and ${plural(items.length - shown.length, "more file")}</div>` : ""}
    </section>`;
}

function viewClean() {
  const data = state.cleanup;
  if (!data || data.items.length === 0) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">🧹</div>
        <h2>Nothing to clean up</h2>
        <p>No leftovers, duplicates, or old installers found.</p>
      </div>`;
  }

  const selected = selectedCleanItems();
  const selectedBytes = selected.reduce((s, i) => s + i.sizeBytes, 0);

  const groups = data.groups
    .map((g) => ({ ...g, items: data.items.filter((i) => i.group === g.key) }))
    .filter((g) => g.items.length > 0);

  return `
    <section class="hero">
      <div>
        <h1>${size(data.totalReclaimableBytes)} you could free up</h1>
        <p>These ${plural(data.totalFlaggedFiles, "file")} look like leftovers you probably don't need.
           Tick what you want gone — it goes to the Recycle Bin, so you can always get it back.</p>
      </div>
      <button type="button" class="btn btn-danger btn-big num" id="do-clean" ${state.working || selected.length === 0 ? "disabled" : ""}>
        ${state.working ? "Moving to Recycle Bin…" : selected.length === 0 ? "Tick files to remove" : `Remove ${plural(selected.length, "file")} (${size(selectedBytes)})`}
      </button>
    </section>

    ${groups
      .map((g) => {
        const picked = g.items.filter((i) => state.cleanSelected.has(i.id)).length;
        const groupBytes = g.items.reduce((s, i) => s + i.sizeBytes, 0);
        const isOpen = state.openGroups.has(g.key);
        const shown = g.items.slice(0, 200);
        return `
        <section class="panel">
          <div class="panel-head">
            <label class="group-title" for="grp-${g.key}">
              <input type="checkbox" id="grp-${g.key}" data-group-toggle="${g.key}"
                ${picked === g.items.length ? "checked" : ""} data-indeterminate="${picked > 0 && picked < g.items.length}" />
              <span>
                <h2>${esc(g.label)}</h2>
                <div class="sub num">${plural(g.items.length, "file")} · ${size(groupBytes)}${picked > 0 ? ` · ${picked} ticked` : ""}</div>
              </span>
            </label>
            <button type="button" class="btn-link" data-open-group="${g.key}" aria-expanded="${isOpen}">
              ${isOpen ? "Hide files" : "See files"}
            </button>
          </div>
          ${
            isOpen
              ? `
            <ul class="rows" role="list">
              ${shown
                .map(
                  (i) => `
                <li class="row">
                  <input type="checkbox" id="it-${i.id}" data-item-toggle="${i.id}" ${state.cleanSelected.has(i.id) ? "checked" : ""} />
                  <label class="row-main" for="it-${i.id}">
                    <div class="row-name" title="${esc(i.path)}">${esc(i.fileName)}</div>
                    <div class="row-sub">${esc(i.reason)} · in ${esc(folderName(i.parentFolder))}</div>
                  </label>
                  <span class="row-size num">${size(i.sizeBytes)}</span>
                  <button type="button" class="btn-link" data-reveal="${esc(i.path)}" aria-label="Show ${esc(i.fileName)} in File Explorer">Show</button>
                </li>`
                )
                .join("")}
            </ul>
            ${g.items.length > shown.length ? `<div class="row-more">…and ${plural(g.items.length - shown.length, "more file")} (ticking the group includes them)</div>` : ""}`
              : ""
          }
        </section>`;
      })
      .join("")}`;
}

function viewHistory() {
  if (state.history.length === 0) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">🕘</div>
        <h2>No history yet</h2>
        <p>Everything you do in Sift shows up here, and you can undo any Tidy Up.</p>
      </div>`;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>What Sift has done</h2>
          <div class="sub">Undo puts files back exactly where they were.</div>
        </div>
      </div>
      <ul class="rows" role="list" style="max-block-size:none;">
        ${state.history
          .map((b) => {
            const isTidy = b.operationType === "ORGANIZE_MOVE";
            const title = isTidy
              ? `Sorted ${plural(b.fileCount, "file")} into folders`
              : `Moved ${plural(b.fileCount, "file")} to the Recycle Bin`;
            let action;
            if (isTidy && b.canRevert) {
              action = `<button type="button" class="btn" data-undo="${esc(b.batchId)}" ${state.working ? "disabled" : ""}>Undo</button>`;
            } else if (isTidy) {
              action = `<span class="row-size">Undone</span>`;
            } else {
              action = `<button type="button" class="btn" id="open-bin-${esc(b.batchId)}" data-open-bin>Open Recycle Bin</button>`;
            }
            return `
            <li class="row">
              <span class="card-icon" aria-hidden="true">${isTidy ? "📁" : "🗑️"}</span>
              <div class="row-main">
                <div class="row-name">${esc(title)}</div>
                <div class="row-sub num">${esc(when(b.timestamp))} · ${size(b.totalBytes)}</div>
              </div>
              ${action}
            </li>`;
          })
          .join("")}
      </ul>
    </section>`;
}

// ---------- render ----------
function render() {
  const content = document.querySelector(".content");
  const scrollTop = content ? content.scrollTop : 0;

  let body;
  if (state.loading && !state.plan) body = viewLoading("Looking through your folders…");
  else if (state.tab === "tidy") body = viewTidy();
  else if (state.tab === "clean") body = viewClean();
  else body = viewHistory();

  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${viewTopbar()}
      <main class="content">
        <div class="page">
          ${state.tab !== "history" ? viewFolders() : ""}
          ${viewNotice()}
          ${state.loading && state.plan ? viewLoading("Refreshing…") : body}
        </div>
      </main>
    </div>`;

  const newContent = document.querySelector(".content");
  if (newContent) newContent.scrollTop = scrollTop;

  document.querySelectorAll("[data-indeterminate='true']").forEach((el) => {
    el.indeterminate = true;
  });

  bind();
}

function on(selector, handler) {
  document.querySelectorAll(selector).forEach((el) => el.addEventListener("click", handler));
}

function bind() {
  on("[data-tab]", (e) => {
    state.tab = e.currentTarget.dataset.tab;
    render();
  });

  on("#dismiss-notice", () => {
    state.notice = null;
    render();
  });

  on("[data-toggle-folder]", (e) => {
    const p = e.currentTarget.dataset.toggleFolder;
    if (state.folders.includes(p)) {
      if (state.folders.length === 1) return;
      state.folders = state.folders.filter((f) => f !== p);
    } else {
      state.folders.push(p);
    }
    loadAll();
  });

  on("[data-remove-folder]", (e) => {
    const p = e.currentTarget.dataset.removeFolder;
    state.folders = state.folders.filter((f) => f !== p);
    if (state.folders.length === 0) state.folders = [DEFAULT_FOLDERS[0].path];
    loadAll();
  });

  on("#add-folder", async () => {
    try {
      const picked = await call("pick_folder_dialog");
      if (picked && !state.folders.includes(picked)) {
        state.folders.push(picked);
        loadAll();
      }
    } catch (err) {
      setNotice("error", `Couldn't open the folder picker: ${err.message}`);
      render();
    }
  });

  on("[data-reveal]", (e) => {
    call("reveal_in_explorer", { path: e.currentTarget.dataset.reveal });
  });

  on("[data-open-bin]", () => call("open_recycle_bin"));

  // Tidy Up
  document.querySelectorAll("[data-cat-toggle]").forEach((el) =>
    el.addEventListener("change", (e) => {
      const key = e.currentTarget.dataset.catToggle;
      if (e.currentTarget.checked) state.tidyUnchecked.delete(key);
      else state.tidyUnchecked.add(key);
      render();
    })
  );
  on("[data-open-cat]", (e) => {
    const key = e.currentTarget.dataset.openCat;
    state.openCategory = state.openCategory === key ? null : key;
    render();
  });
  on("#do-tidy", doTidyUp);

  // Clean Up
  document.querySelectorAll("[data-group-toggle]").forEach((el) =>
    el.addEventListener("change", (e) => {
      const key = e.currentTarget.dataset.groupToggle;
      const items = state.cleanup.items.filter((i) => i.group === key);
      const allPicked = items.every((i) => state.cleanSelected.has(i.id));
      for (const i of items) {
        if (allPicked) state.cleanSelected.delete(i.id);
        else state.cleanSelected.add(i.id);
      }
      render();
    })
  );
  document.querySelectorAll("[data-item-toggle]").forEach((el) =>
    el.addEventListener("change", (e) => {
      const id = e.currentTarget.dataset.itemToggle;
      if (e.currentTarget.checked) state.cleanSelected.add(id);
      else state.cleanSelected.delete(id);
      render();
    })
  );
  on("[data-open-group]", (e) => {
    const key = e.currentTarget.dataset.openGroup;
    if (state.openGroups.has(key)) state.openGroups.delete(key);
    else state.openGroups.add(key);
    render();
  });
  on("#do-clean", doCleanUp);

  // Undo (History + notice)
  on("[data-undo]", (e) => doUndo(e.currentTarget.dataset.undo));
}

// --- Heartbeat & Auto-Shutdown (clean process lifecycle) ---
const clientId = Math.random().toString(36).slice(2);

function sendHeartbeat() {
  fetch("/api/ipc/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  }).catch(() => {});
}

// Send initial ping and maintain periodic heartbeat every 3 seconds
sendHeartbeat();
setInterval(sendHeartbeat, 3000);

// Ping immediately when window regains focus or visibility
window.addEventListener("focus", sendHeartbeat);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendHeartbeat();
});

// Notify backend when window is closed
window.addEventListener("beforeunload", () => {
  const payload = JSON.stringify({ clientId });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/ipc/shutdown", payload);
  } else {
    fetch("/api/ipc/shutdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
});

loadAll();
