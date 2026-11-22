const els = {
	form: document.getElementById("form"),
	input: document.getElementById("urlInput"),
	downloadBtn: document.getElementById("downloadBtn"),
	downloadLabel: document.getElementById("downloadLabel"),
	hint: document.getElementById("hint"),
	console: document.getElementById("console"),
	statusPill: document.getElementById("statusPill"),
	progress: document.getElementById("progress"),
	liveDot: document.getElementById("liveDot"),
	clearLogs: document.getElementById("clearLogs"),
	openFolder: document.getElementById("openFolder"),
	downloads: document.getElementById("downloads"),
	downloadsCount: document.getElementById("downloadsCount"),
	refreshLibrary: document.getElementById("refreshLibrary"),
	sessionDot: document.getElementById("sessionDot"),
	sessionState: document.getElementById("sessionState"),
	sessionDetail: document.getElementById("sessionDetail"),
	recheckSession: document.getElementById("recheckSession"),
	statSaved: document.getElementById("statSaved"),
	statSize: document.getElementById("statSize"),
	statCache: document.getElementById("statCache"),
	statLast: document.getElementById("statLast"),
	resultCard: document.getElementById("resultCard"),
	resultInitial: document.getElementById("resultInitial"),
	resultName: document.getElementById("resultName"),
	resultMeta: document.getElementById("resultMeta"),
	resultReveal: document.getElementById("resultReveal"),
	resultCopy: document.getElementById("resultCopy"),
	history: document.getElementById("history"),
	historyCount: document.getElementById("historyCount"),
	clearHistory: document.getElementById("clearHistory"),
	clock: document.getElementById("clock"),
	elapsed: document.getElementById("elapsed"),
	themePicker: document.getElementById("themePicker"),
	themeBtn: document.getElementById("themeBtn"),
	themeLabel: document.getElementById("themeLabel"),
	themeSwatch: document.getElementById("themeSwatch"),
	themeMenu: document.getElementById("themeMenu"),
	discordCopy: document.getElementById("discordCopy"),
	discordTag: document.getElementById("discordTag"),
	shutdownBtn: document.getElementById("shutdownBtn"),
	shutdownLabel: document.getElementById("shutdownLabel"),
	bye: document.getElementById("bye"),
	closeTab: document.getElementById("closeTab"),
	rain: document.getElementById("rain"),
};

const THEMES = [
	{ id: "matrix", label: "Matrix" },
	{ id: "blue", label: "Blue" },
	{ id: "amoled", label: "AMOLED" },
];
const THEME_KEY = "vrh.theme";
const DISCORD_HANDLE = "rickyyyyy1020";
const SESSION_KEY = "vrh.sessionStart";
const DEFAULT_HINT = els.hint.innerHTML;

const state = {
	job: null,
	history: [],
	running: false,
	ticker: null,
	source: null,
	confirmingShutdown: false,
	confirmTimer: null,
	copyTimer: null,
	library: { files: [], stats: {} },
	expanded: new Set(),
};

const ICONS = {
	success:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5"/></svg>',
	error:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
	running: '<span class="ring"></span>',
};

const UI_ICONS = {
	reveal:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.1a2 2 0 0 1 1.5.7l.9 1.1h6.5a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
	trash:
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V5.2h5V7M6.5 7l.8 11.3a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/></svg>',
	caret:
		'<svg class="h-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9.5 6 6 6-6"/></svg>',
};

const stampFormat = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

const clockFormat = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

// ---------------------------------------------------------------- helpers

function stamp(timestamp) {
	return stampFormat.format(new Date(timestamp || Date.now()));
}

function formatBytes(bytes) {
	if (typeof bytes !== "number" || !bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

function formatDuration(milliseconds) {
	const total = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const pad = (value) => String(value).padStart(2, "0");
	return hours > 0
		? `${hours}:${pad(minutes)}:${pad(seconds)}`
		: `${minutes}:${pad(seconds)}`;
}

function timeAgo(timestamp) {
	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

function setHint(html, tone) {
	els.hint.innerHTML = html;
	els.hint.classList.remove("is-error", "is-success", "is-muted");
	if (tone) els.hint.classList.add(`is-${tone}`);
}

function scrollConsoleToBottom() {
	els.console.scrollTop = els.console.scrollHeight;
}

function isNearBottom() {
	return els.console.scrollHeight - els.console.scrollTop - els.console.clientHeight < 70;
}

// ---------------------------------------------------------------- log rendering

function emptyConsole() {
	const wrap = document.createElement("div");
	wrap.className = "empty";
	wrap.innerHTML =
		'<p class="empty-title">Nothing running</p><p class="empty-sub">Logs stream here while a model is being fetched and deobfuscated.</p>';
	return wrap;
}

function logRow(entry, animate) {
	const row = document.createElement("div");
	row.className = `log is-${entry.level || "info"}${animate ? "" : " static"}`;

	const time = document.createElement("span");
	time.className = "log-time";
	time.textContent = stamp(entry.at);

	const message = document.createElement("span");
	message.className = "log-msg";
	message.textContent = entry.message;

	row.append(time, message);
	return row;
}

function appendLog(entry) {
	if (!entry) return;

	const placeholder = els.console.firstElementChild;
	if (placeholder && placeholder.classList.contains("empty")) {
		els.console.replaceChildren();
	}

	const stick = isNearBottom();
	els.console.append(logRow(entry, true));

	while (els.console.childElementCount > 400) {
		els.console.firstElementChild.remove();
	}

	if (stick) scrollConsoleToBottom();
}

function resetLogs(logs) {
	els.console.replaceChildren();

	if (!logs || !logs.length) {
		els.console.append(emptyConsole());
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const entry of logs) fragment.append(logRow(entry, false));
	els.console.append(fragment);
	scrollConsoleToBottom();
}

// ---------------------------------------------------------------- history

function emptyHistory() {
	const wrap = document.createElement("div");
	wrap.className = "empty";
	wrap.innerHTML =
		'<p class="empty-title">No attempts yet</p><p class="empty-sub">Every download you start shows up here with its result.</p>';
	return wrap;
}

function historyRow(item) {
	const open = state.expanded.has(item.jobId);

	const row = document.createElement("div");
	row.className = `h-item${open ? " is-open" : ""}`;
	row.dataset.jobId = item.jobId;
	if (item.url) row.title = item.url;

	const head = document.createElement("div");
	head.className = "h-row";
	head.setAttribute("role", "button");
	head.tabIndex = 0;
	head.setAttribute("aria-expanded", String(open));

	const icon = document.createElement("span");
	icon.className = `h-icon is-${item.status}`;
	icon.innerHTML = ICONS[item.status] || ICONS.running;

	const body = document.createElement("div");
	body.className = "h-body";

	const title = document.createElement("div");
	title.className = "h-title";
	title.textContent = item.name || `Model ${item.modelId}`;

	const meta = document.createElement("div");
	meta.className = "h-meta";

	const parts = [timeAgo(item.startedAt)];
	if (item.status === "running") parts.push("downloading…");
	if (item.status === "success" && item.size) parts.push(formatBytes(item.size));
			if (item.status === "error" && item.error) {
			parts.push(
				item.errorKind === "no-session"
					? "login-gated preview — no VRoid session"
					: item.errorKind === "no-preview"
						? "preview unavailable on VRoid Hub"
						: item.error,
			);
			meta.classList.add("is-error");
		}
	if (item.status === "success" && item.fileName) parts.push(item.fileName);

	meta.textContent = parts.join(" · ");
	meta.title = meta.textContent;

	body.append(title, meta);

	const caretBox = document.createElement("span");
	caretBox.className = "h-caret-box";
	caretBox.innerHTML = UI_ICONS.caret;

	head.append(icon, body, caretBox);
	row.append(head);

	if (open) row.append(historyDetail(item));
	return row;
}

function historyDetail(item) {
	const detail = document.createElement("div");
	detail.className = "h-detail";

	const actions = document.createElement("div");
	actions.className = "h-actions";

	const makeAction = (action, label) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn-mini";
		button.textContent = label;
		button.dataset.histAction = action;
		button.dataset.jobId = item.jobId;
		return button;
	};

	actions.append(makeAction("retry", "Retry"));
	if (item.fileName) actions.append(makeAction("reveal", "Reveal file"));
	actions.append(makeAction("copy", "Copy link"));
	detail.append(actions);

	const logs = document.createElement("div");
	logs.className = "h-logs";

	const lines = Array.isArray(item.logs) ? item.logs : [];
	if (!lines.length) {
		const none = document.createElement("span");
		none.className = "h-nolog";
		none.textContent = "No log lines were kept for this run.";
		logs.append(none);
	} else {
		for (const line of lines) {
			const logRow = document.createElement("div");
			logRow.className = `h-log is-${line.level || "info"}`;

			const time = document.createElement("span");
			time.textContent = stamp(line.at);

			const message = document.createElement("span");
			message.textContent = line.message;

			logRow.append(time, message);
			logs.append(logRow);
		}
	}

	detail.append(logs);
	return detail;
}

function toggleHistory(row) {
	const id = row.dataset.jobId;
	const open = !state.expanded.has(id);

	if (open) state.expanded.add(id);
	else state.expanded.delete(id);

	row.classList.toggle("is-open", open);
	row.querySelector(".h-row")?.setAttribute("aria-expanded", String(open));

	const existing = row.querySelector(".h-detail");
	if (open && !existing) {
		const item = state.history.find((entry) => entry.jobId === id);
		if (item) row.append(historyDetail(item));
	} else if (!open && existing) {
		existing.remove();
	}
}

function renderHistory() {
	els.historyCount.textContent = String(state.history.length);
	els.clearHistory.disabled = !state.history.length;
	els.history.replaceChildren();

	if (!state.history.length) {
		els.history.append(emptyHistory());
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const item of state.history) fragment.append(historyRow(item));
	els.history.append(fragment);
}

// ---------------------------------------------------------------- session

function renderSession(data) {
	const hasSession = Boolean(data?.hasSession);

	els.sessionDot.className = `session-dot ${hasSession ? "is-ok" : "is-missing"}`;
	els.sessionState.textContent = hasSession ? "VRoid session detected" : "No VRoid session cookie";
	els.sessionDetail.textContent = hasSession
		? `Firefox profile: ${data.profile || "unknown"}`
		: "Sign in at hub.vroid.com in Firefox";
}

async function loadSession() {
	els.recheckSession.disabled = true;

	try {
		const response = await fetch("/api/session");
		if (!response.ok) throw new Error(String(response.status));
		renderSession(await response.json());
	} catch {
		els.sessionDot.className = "session-dot";
		els.sessionState.textContent = "Session check failed";
		els.sessionDetail.textContent = "The server did not answer";
	} finally {
		els.recheckSession.disabled = false;
	}
}

// ---------------------------------------------------------------- library

function emptyDownloads() {
	const wrap = document.createElement("div");
	wrap.className = "empty";
	wrap.innerHTML =
		'<p class="empty-title">No files yet</p><p class="empty-sub">Finished downloads land here and in the downloads folder.</p>';
	return wrap;
}

function iconAction(action, name, title, svg, danger) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `icon-btn${danger ? " is-danger" : ""}`;
	button.dataset.fileAction = action;
	button.dataset.name = name;
	button.dataset.armed = "0";
	button.title = title;
	button.setAttribute("aria-label", `${title}: ${name}`);
	button.innerHTML = svg;
	return button;
}

function downloadRow(file) {
	const row = document.createElement("div");
	row.className = "dl-item";

	const body = document.createElement("div");
	body.className = "dl-body";

	const name = document.createElement("div");
	name.className = "dl-name";
	name.textContent = file.name;
	name.title = file.name;

	const meta = document.createElement("div");
	meta.className = "dl-meta";
	meta.textContent = `${formatBytes(file.size) || "0 B"} · ${timeAgo(file.modified)}`;

	body.append(name, meta);

	const actions = document.createElement("div");
	actions.className = "dl-actions";
	actions.append(
		iconAction("reveal", file.name, "Show in folder", UI_ICONS.reveal, false),
		iconAction("delete", file.name, "Delete file (click twice)", UI_ICONS.trash, true),
	);

	row.append(body, actions);
	return row;
}

function renderLibrary() {
	const files = state.library?.files || [];
	const stats = state.library?.stats || {};

	els.downloadsCount.textContent = String(files.length);
	els.statSaved.textContent = String(stats.savedCount ?? files.length);
	els.statSize.textContent = formatBytes(stats.totalBytes) || "0 B";
	els.statCache.textContent = String(stats.cacheEntries ?? 0);
	els.statLast.textContent = stats.lastDurationMs ? formatDuration(stats.lastDurationMs) : "—";

	els.downloads.replaceChildren();

	if (!files.length) {
		els.downloads.append(emptyDownloads());
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const file of files) fragment.append(downloadRow(file));
	els.downloads.append(fragment);

	// Keep the latest download on screen after a reload, not just right after a run.
	if (els.resultCard.hidden && files[0]) {
		showResult({
			status: "success",
			fileName: files[0].name,
			filePath: "",
			size: files[0].size,
			modelName: files[0].name.replace(/\.deob\.vrm$/i, "").replace(/\.vrm$/i, ""),
			durationMs: null,
		});
	}
}

async function loadLibrary() {
	try {
		const response = await fetch("/api/library");
		if (!response.ok) return;
		state.library = await response.json();
		renderLibrary();
	} catch {
		// keep the previous listing
	}
}

async function revealFile(name) {
	if (!name) return;

	try {
		const response = await fetch("/api/downloads/reveal", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (response.ok) return;

		const data = await response.json().catch(() => ({}));
		throw new Error(data.error || "Could not reveal that file.");
	} catch (error) {
		setHint(escapeHtml(error.message), "error");
	}
}

async function deleteFile(name) {
	try {
		const response = await fetch("/api/downloads/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});

		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || "Could not delete that file.");

		// Never leave the result card pointing at a file that no longer exists.
		if (els.resultCard.dataset.fileName === name) {
			els.resultCard.hidden = true;
			els.resultCard.dataset.fileName = "";
			els.resultCard.dataset.filePath = "";
		}

		await loadLibrary();
	} catch (error) {
		setHint(escapeHtml(error.message), "error");
	}
}

// ---------------------------------------------------------------- result card

function showResult(job) {
	if (!job || job.status !== "success" || !job.fileName) return;

	els.resultCard.hidden = false;
	els.resultCard.dataset.fileName = job.fileName;
	els.resultCard.dataset.filePath = job.filePath || "";

	const title = job.modelName || job.fileName;
	els.resultName.textContent = title;
	els.resultName.title = title;
	els.resultInitial.textContent = title.trim().charAt(0).toUpperCase() || "V";

	const meta = [
		formatBytes(job.size),
		job.durationMs ? `in ${formatDuration(job.durationMs)}` : null,
		job.fileName,
	].filter(Boolean);

	els.resultMeta.textContent = meta.join(" · ");
	els.resultMeta.title = meta.join(" · ");
}

// ---------------------------------------------------------------- job status

function stopTicker() {
	if (state.ticker) {
		clearInterval(state.ticker);
		state.ticker = null;
	}
}

function startTicker(startedAt) {
	stopTicker();

	const tick = () => {
		const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
		const label =
			seconds < 60
				? `Running · ${seconds}s`
				: `Running · ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
		els.statusPill.textContent = label;
	};

	tick();
	state.ticker = setInterval(tick, 1000);
}

function updateJobUI() {
	const job = state.job;
	const running = job?.status === "running";

	state.running = running;
	els.downloadBtn.disabled = running;
	els.downloadBtn.classList.toggle("is-running", running);
	els.downloadLabel.textContent = running ? "Working…" : "Download";
	els.progress.hidden = !running;

	els.statusPill.className = "status-pill";

	if (running) {
		els.statusPill.classList.add("is-running");
		startTicker(job.startedAt);
		return;
	}

	stopTicker();

	if (job?.status === "success") {
		els.statusPill.classList.add("is-success");
		els.statusPill.textContent = "Complete";
	} else if (job?.status === "error") {
		els.statusPill.classList.add("is-error");
		els.statusPill.textContent = "Failed";
	} else {
		els.statusPill.textContent = "Idle";
	}
}

// ---------------------------------------------------------------- theme

const rainColors = { bg: "0, 0, 0", accent: "34, 224, 107" };
let rainColumns = [];
let rainCtx = null;
const RAIN_SIZE = 15;
const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789<>[]{}/\\|=+*#$%&@".split("");

function cacheThemeColors() {
	const style = getComputedStyle(document.documentElement);
	rainColors.bg = style.getPropertyValue("--bg-rgb").trim() || "0, 0, 0";
	rainColors.accent = style.getPropertyValue("--accent-rgb").trim() || "34, 224, 107";
}

function setupRain() {
	if (!els.rain) return;
	rainCtx = els.rain.getContext("2d");
	if (!rainCtx) return;

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	els.rain.width = Math.floor(window.innerWidth * dpr);
	els.rain.height = Math.floor(window.innerHeight * dpr);
	rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	rainCtx.fillStyle = `rgb(${rainColors.bg})`;
	rainCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);

	const columns = Math.ceil(window.innerWidth / RAIN_SIZE);
	rainColumns = Array.from({ length: columns }, () => Math.random() * -window.innerHeight);
}

function drawRain() {
	if (!rainCtx || document.hidden) return;
	if (document.documentElement.dataset.theme === "amoled") return;

	const width = window.innerWidth;
	const height = window.innerHeight;

	rainCtx.fillStyle = `rgba(${rainColors.bg}, 0.1)`;
	rainCtx.fillRect(0, 0, width, height);
	rainCtx.font = `${RAIN_SIZE - 1}px "Cascadia Code", ui-monospace, monospace`;
	rainCtx.textBaseline = "top";

	for (let i = 0; i < rainColumns.length; i++) {
		const x = i * RAIN_SIZE;
		const y = rainColumns[i];
		const glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
		rainCtx.fillStyle =
			Math.random() < 0.05
				? `rgba(${rainColors.accent}, 0.95)`
				: `rgba(${rainColors.accent}, 0.5)`;
		rainCtx.fillText(glyph, x, y);

		rainColumns[i] = y > height + Math.random() * 240 ? 0 : y + RAIN_SIZE;
	}
}

function syncThemeUI(theme) {
	const entry = THEMES.find((item) => item.id === theme) || THEMES[0];
	els.themeLabel.textContent = entry.label;
	els.themeSwatch.dataset.swatch = theme;

	for (const option of els.themeMenu.querySelectorAll("[data-theme-option]")) {
		option.setAttribute(
			"aria-selected",
			String(option.dataset.themeOption === theme),
		);
	}
}

function applyTheme(name, { persist = true } = {}) {
	const theme = THEMES.some((item) => item.id === name) ? name : "matrix";
	document.documentElement.dataset.theme = theme;
	syncThemeUI(theme);

	if (persist) {
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {}
	}

	cacheThemeColors();
	setupRain();
}

// Keep the menu inside the viewport: it is right-aligned to the trigger by
// default, which would push it off-screen when the trigger wraps to the left.
function positionThemeMenu() {
	const menu = els.themeMenu;
	menu.style.left = "";
	menu.style.right = "";

	const trigger = els.themeBtn.getBoundingClientRect();
	const picker = els.themePicker.getBoundingClientRect();
	const width = menu.offsetWidth;
	const margin = 10;

	let left = Math.min(trigger.right - width, window.innerWidth - width - margin);
	left = Math.max(left, margin);

	menu.style.left = `${Math.round(left - picker.left)}px`;
	menu.style.right = "auto";
}

function setThemeMenu(open) {
	els.themeMenu.hidden = !open;
	els.themeBtn.setAttribute("aria-expanded", String(open));
	if (open) positionThemeMenu();
}

els.themeBtn.addEventListener("click", (event) => {
	event.stopPropagation();
	setThemeMenu(els.themeMenu.hidden);
});

els.themeMenu.addEventListener("click", (event) => {
	const option = event.target.closest("[data-theme-option]");
	if (!option) return;
	applyTheme(option.dataset.themeOption);
	setThemeMenu(false);
	els.themeBtn.focus();
});

document.addEventListener("click", (event) => {
	if (!els.themePicker.contains(event.target)) setThemeMenu(false);
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape" || els.themeMenu.hidden) return;
	setThemeMenu(false);
	els.themeBtn.focus();
});

// ---------------------------------------------------------------- clipboard

async function copyToClipboard(text) {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {}
	}

	// Fallback for browsers that refuse the async clipboard API.
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.top = "-1000px";
	area.style.opacity = "0";
	document.body.append(area);
	area.select();

	let ok = false;
	try {
		ok = document.execCommand("copy");
	} catch {}

	area.remove();
	return ok;
}

els.discordCopy.addEventListener("click", async () => {
	const ok = await copyToClipboard(DISCORD_HANDLE);
	clearTimeout(state.copyTimer);

	els.discordTag.textContent = ok ? "copied to clipboard" : DISCORD_HANDLE;
	els.discordCopy.classList.toggle("is-copied", ok);

	state.copyTimer = setTimeout(() => {
		els.discordTag.textContent = DISCORD_HANDLE;
		els.discordCopy.classList.remove("is-copied");
	}, 1800);
});

// ---------------------------------------------------------------- clock + session timer

function readSessionStart() {
	let startedAt = 0;
	try {
		startedAt = Number(sessionStorage.getItem(SESSION_KEY));
	} catch {}

	if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now()) {
		startedAt = Date.now();
		try {
			sessionStorage.setItem(SESSION_KEY, String(startedAt));
		} catch {}
	}

	return startedAt;
}

const SESSION_START = readSessionStart();

function tickClock() {
	const now = new Date();
	els.clock.textContent = clockFormat.format(now);
	els.elapsed.textContent = formatDuration(Date.now() - SESSION_START);
}

// ---------------------------------------------------------------- failure hints

const FAILURE_HINTS = {
	"no-session": {
		title: "This preview is login-gated",
		text: "VRoid Hub needs a signed-in session for this model, but no VRoid cookie was found in Firefox. Sign in at hub.vroid.com in Firefox (and stay signed in), then run the link again.",
	},
	"no-preview": {
		title: "VRoid Hub returned no preview file",
		text: "Both /optimized_preview and /preview failed for this model. It may be private, age-restricted or removed, or the Hub may be rate-limiting you. Open the model page in a browser to confirm it still loads.",
	},
};

function escapeHtml(value) {
	return String(value).replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char],
	);
}

function failureHint(job) {
	const info = FAILURE_HINTS[job?.errorKind];
	const raw = escapeHtml(job?.error || "Download failed.");

	if (!info) return raw;
	return `<strong>${info.title}.</strong> ${info.text} <span class="hint-raw">${raw}</span>`;
}

// ---------------------------------------------------------------- events

function handleEvent(data) {
	switch (data.type) {
		case "hello": {
			els.liveDot.classList.add("is-live");
			resetLogs(data.logs);
			state.history = data.history || [];
			renderHistory();
			state.job = data.job || null;
			updateJobUI();
			if (data.job?.status === "success") showResult(data.job);
			break;
		}
		case "log": {
			appendLog(data.log);
			break;
		}
		case "job": {
			state.job = data.job;
			updateJobUI();

			if (data.job?.status === "running") {
				setHint(`Downloading model <span class="mono">${data.job.modelId}</span>…`, "muted");
			} else if (data.job?.status === "success") {
				setHint("Saved to your downloads folder.", "success");
				showResult(data.job);
			} else if (data.job?.status === "error") {
				setHint(failureHint(data.job), "error");
			}

			if (data.job?.status !== "running") loadLibrary();
			break;
		}
		case "history": {
			state.history = data.history || [];
			renderHistory();
			break;
		}
		case "logs-cleared": {
			resetLogs([]);
			break;
		}
	}
}

function connect() {
	const source = new EventSource("/api/events");
	state.source = source;

	source.addEventListener("open", () => {
		els.liveDot.classList.add("is-live");
	});

	source.addEventListener("error", () => {
		els.liveDot.classList.remove("is-live");
	});

	source.addEventListener("message", (event) => {
		let data;
		try {
			data = JSON.parse(event.data);
		} catch {
			return;
		}
		handleEvent(data);
	});
}

// ---------------------------------------------------------------- actions

els.form.addEventListener("submit", async (event) => {
	event.preventDefault();

	if (state.running) return;

	const url = els.input.value.trim();
	if (!url) {
		setHint("Paste a VRoid Hub model link first.", "error");
		els.input.focus();
		return;
	}

	els.downloadBtn.disabled = true;

	try {
		const response = await fetch("/api/download", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});

		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(data.error || `Request failed (${response.status})`);
		}

		state.job = data.job;
		updateJobUI();
		setHint(`Downloading model <span class="mono">${data.job.modelId}</span>…`, "muted");
	} catch (error) {
		els.downloadBtn.disabled = false;
		setHint(error.message, "error");
	}
});

els.openFolder.addEventListener("click", async () => {
	try {
		const response = await fetch("/api/open-downloads", { method: "POST" });
		if (!response.ok) {
			const data = await response.json().catch(() => ({}));
			throw new Error(data.error || "Could not open the downloads folder.");
		}
	} catch (error) {
		setHint(error.message, "error");
	}
});

els.clearLogs.addEventListener("click", () => {
	resetLogs([]);
	fetch("/api/logs/clear", { method: "POST" }).catch(() => {});
});

els.recheckSession.addEventListener("click", () => {
	loadSession();
});

els.refreshLibrary.addEventListener("click", () => {
	loadLibrary();
});

els.downloads.addEventListener("click", async (event) => {
	const button = event.target.closest("[data-file-action]");
	if (!button) return;

	if (button.dataset.fileAction === "reveal") {
		await revealFile(button.dataset.name);
		return;
	}

	// Deleting a file takes a deliberate second click on the same row.
	if (button.dataset.armed === "1") {
		await deleteFile(button.dataset.name);
		return;
	}

	button.dataset.armed = "1";
	button.classList.add("is-armed");
	button.title = "Click again to delete this file";

	setTimeout(() => {
		if (!button.isConnected) return;
		button.dataset.armed = "0";
		button.classList.remove("is-armed");
		button.title = "Delete file (click twice)";
	}, 5000);
});

els.history.addEventListener("click", async (event) => {
	const action = event.target.closest("[data-hist-action]");

	if (action) {
		const item = state.history.find((entry) => entry.jobId === action.dataset.jobId);
		if (!item) return;

		if (action.dataset.histAction === "retry") startRetry(item);
		else if (action.dataset.histAction === "reveal") await revealFile(item.fileName);
		else if (action.dataset.histAction === "copy") {
			await copyToClipboard(item.url || item.modelId);
		}
		return;
	}

	if (event.target.closest(".h-detail")) return;

	const row = event.target.closest(".h-item");
	if (row) toggleHistory(row);
});

els.history.addEventListener("keydown", (event) => {
	if (event.key !== "Enter" && event.key !== " ") return;

	const head = event.target.closest(".h-row");
	if (!head) return;

	event.preventDefault();
	toggleHistory(head.closest(".h-item"));
});

function startRetry(item) {
	if (state.running) {
		setHint("A download is already running. Wait for it to finish.", "error");
		return;
	}

	els.input.value = item.url || item.modelId;
	els.form.requestSubmit();
}

els.resultReveal.addEventListener("click", () => {
	revealFile(els.resultCard.dataset.fileName);
});

els.resultCopy.addEventListener("click", async () => {
	const text = els.resultCard.dataset.filePath || els.resultCard.dataset.fileName;
	if (!text) return;

	const ok = await copyToClipboard(text);
	els.resultCopy.textContent = ok ? "Copied" : "Copy failed";

	setTimeout(() => {
		els.resultCopy.textContent = "Copy path";
	}, 1600);
});

els.clearHistory.addEventListener("click", async () => {
	els.clearHistory.disabled = true;

	try {
		const response = await fetch("/api/history/clear", { method: "POST" });
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || "Could not clear the history.");

		state.history = data.history || [];
		renderHistory();
	} catch (error) {
		setHint(escapeHtml(error.message), "error");
	} finally {
		els.clearHistory.disabled = !state.history.length;
	}
});

els.input.addEventListener("input", () => {
	if (els.hint.classList.contains("is-error") && !state.confirmingShutdown) {
		setHint(DEFAULT_HINT);
	}
});

// ---------------------------------------------------------------- shutdown

function disarmShutdown() {
	state.confirmingShutdown = false;
	clearTimeout(state.confirmTimer);
	state.confirmTimer = null;
	els.shutdownBtn.classList.remove("is-armed");
	els.shutdownLabel.textContent = "Shut down";
}

function finishShutdown() {
	state.source?.close();
	try {
		sessionStorage.removeItem(SESSION_KEY);
	} catch {}
	els.bye.hidden = false;
	// Browsers only honour this for script-opened windows; the card is the fallback.
	try {
		window.close();
	} catch {}
}

els.shutdownBtn.addEventListener("click", async () => {
	if (!state.confirmingShutdown) {
		state.confirmingShutdown = true;
		els.shutdownBtn.classList.add("is-armed");
		els.shutdownLabel.textContent = "Confirm stop";
		setHint(
			"Click again to stop the server. This closes the app and cancels any running download.",
			"error",
		);
		state.confirmTimer = setTimeout(() => {
			disarmShutdown();
			setHint(DEFAULT_HINT);
		}, 5000);
		return;
	}

	clearTimeout(state.confirmTimer);
	els.shutdownBtn.disabled = true;
	els.shutdownLabel.textContent = "Stopping…";

	try {
		await fetch("/api/shutdown", { method: "POST" });
	} catch {
		// the server may drop the connection as it exits
	}

	finishShutdown();
});

els.closeTab.addEventListener("click", () => {
	window.close();
});

// ---------------------------------------------------------------- boot

applyTheme(document.documentElement.dataset.theme, { persist: false });
	state.history = [];
	renderHistory();
	connect();
	loadSession();
	loadLibrary();
tickClock();
setInterval(tickClock, 1000);
els.input.focus();

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
	setInterval(drawRain, 70);
}

let rainResizeTimer = null;
window.addEventListener("resize", () => {
	if (!els.themeMenu.hidden) positionThemeMenu();
	clearTimeout(rainResizeTimer);
	rainResizeTimer = setTimeout(setupRain, 180);
});

// Files can change outside the app (Explorer, another terminal); resync on return.
window.addEventListener("focus", () => loadLibrary());
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) loadLibrary();
});

// Refresh relative timestamps, but never rebuild a row the user has opened.
setInterval(() => {
	if (state.history.length && state.expanded.size === 0) renderHistory();
}, 45000);
