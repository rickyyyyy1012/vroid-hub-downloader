// Local web UI for the VRoid Hub downloader.
// Serves ./public, runs the deobfuscator, streams its logs over SSE and keeps a history file.

import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "node:util";

import { deobfuscateVRoidHubGLB, getVRoidSessionStatus } from "./index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DOWNLOADS_DIR = path.join(ROOT, "downloads");
const HISTORY_FILE = path.join(ROOT, "history.json");

const PORT = Number(process.env.PORT) || 4321;
const HOST = "127.0.0.1";
const URL_BASE = `http://${HOST}:${PORT}`;
const OPEN_BROWSER = process.argv.includes("--open") || process.env.VRH_OPEN === "1";
const LOG_LIMIT = 1000;
const HISTORY_LIMIT = 200;

// The deobfuscator reads ./cache and writes ./debug relative to the cwd,
// so pin the cwd to the project folder no matter where the server is started from.
process.chdir(ROOT);

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".json": "application/json; charset=utf-8",
	".woff2": "font/woff2",
};

// ---------------------------------------------------------------- state

let history = [];
let currentJob = null;
const logBuffer = [];
let logSeq = 0;
const clients = new Set();

// ---------------------------------------------------------------- helpers

function sendJson(res, status, payload) {
	if (res.writableEnded) return;
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
		"Cache-Control": "no-store",
	});
	res.end(body);
}

function sendText(res, status, text) {
	if (res.writableEnded) return;
	res.writeHead(status, {
		"Content-Type": "text/plain; charset=utf-8",
		"Content-Length": Buffer.byteLength(text),
		"Cache-Control": "no-store",
	});
	res.end(text);
}

function sse(res, payload) {
	try {
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
	} catch {
		clients.delete(res);
	}
}

function broadcast(payload) {
	for (const res of clients) sse(res, payload);
}

function addLog(level, message) {
	const entry = { seq: ++logSeq, level, message, at: Date.now() };
	logBuffer.push(entry);
	if (logBuffer.length > LOG_LIMIT) {
		logBuffer.splice(0, logBuffer.length - LOG_LIMIT);
	}
	process.stdout.write(`${level === "info" ? "  " : "! "}${message}\n`);
	broadcast({ type: "log", log: entry });
	return entry;
}

function formatBytes(bytes) {
	if (typeof bytes !== "number" || Number.isNaN(bytes)) return "";
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

// Mirror console output of the running job into the UI log stream.
function tapConsole() {
	const originals = {
		log: console.log,
		info: console.info,
		warn: console.warn,
		error: console.error,
		debug: console.debug,
	};

	const make = (level) => (...args) => {
		let text;
		try {
			text = format(...args);
		} catch {
			text = args.map((arg) => String(arg)).join(" ");
		}
		addLog(level, text);
	};

	console.log = make("info");
	console.info = make("info");
	console.debug = make("info");
	console.warn = make("warn");
	console.error = make("error");

	return () => {
		console.log = originals.log;
		console.info = originals.info;
		console.debug = originals.debug;
		console.warn = originals.warn;
		console.error = originals.error;
	};
}

async function loadHistory() {
	try {
		const raw = await readFile(HISTORY_FILE, "utf8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) history = parsed.slice(0, HISTORY_LIMIT);
	} catch {
		history = [];
	}
}

async function saveHistory() {
	try {
		await writeFile(HISTORY_FILE, JSON.stringify(history.slice(0, HISTORY_LIMIT), null, 2));
	} catch {
		// history is a convenience, never fail a run over it
	}
}

async function readDownloads() {
	const files = [];
	let entries = [];

	try {
		entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
	} catch {
		return files;
	}

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".vrm")) continue;
		const fullPath = path.join(DOWNLOADS_DIR, entry.name);
		try {
			const info = await stat(fullPath);
			files.push({ name: entry.name, size: info.size, modified: info.mtimeMs });
		} catch {
			// file vanished between listing and stat
		}
	}

	files.sort((a, b) => b.modified - a.modified);
	return files;
}

async function buildLibrary() {
	const files = await readDownloads();

	let cacheEntries = 0;
	try {
		cacheEntries = (await readdir(path.join(ROOT, "cache"))).length;
	} catch {
		cacheEntries = 0;
	}

	const finished = history.find((item) => typeof item.durationMs === "number");

	return {
		files,
		stats: {
			savedCount: files.length,
			totalBytes: files.reduce((sum, file) => sum + file.size, 0),
			cacheEntries,
			lastDurationMs: finished?.durationMs ?? null,
		},
	};
}

// Only resolves names inside the downloads folder, never an arbitrary path.
function resolveDownload(rawName) {
	const name = path.basename(String(rawName ?? "").trim());
	if (!name || name === "." || name === ".." || name !== String(rawName ?? "").trim()) return null;

	const fullPath = path.join(DOWNLOADS_DIR, name);
	const relative = path.relative(DOWNLOADS_DIR, fullPath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

	return { name, fullPath };
}

// Resolves once the process is actually launched and rejects when the spawn
// fails, so the caller can tell the user instead of assuming it worked.
function launchDetached(command, args) {
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer = null;

		const finish = (fn, value) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			fn(value);
		};

		let child;
		try {
			child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
		} catch (error) {
			reject(error);
			return;
		}

		child.once("error", (error) => finish(reject, error));
		child.once("spawn", () => {
			child.unref();
			finish(resolve);
		});

		// Never leave the request hanging if neither event arrives.
		timer = setTimeout(() => finish(resolve), 3000);
	});
}

function revealPath(fullPath) {
	const [command, args] =
		process.platform === "win32"
			? ["explorer.exe", [`/select,${fullPath}`]]
			: process.platform === "darwin"
				? ["open", ["-R", fullPath]]
				: ["xdg-open", [path.dirname(fullPath)]];

	return launchDetached(command, args);
}

function readBody(req, limit = 1 << 20) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				req.destroy();
				reject(new Error("Request body is too large."));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function parseTarget(raw) {
	const value = String(raw ?? "").trim();

	if (!value) {
		throw new Error("Paste a VRoid Hub model link first.");
	}

	if (/^\d{3,}$/.test(value)) {
		return { modelId: value, url: `https://hub.vroid.com/en/characters/-/models/${value}` };
	}

	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("That does not look like a link. It should start with https://hub.vroid.com/");
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("Only http(s) links are supported.");
	}

	const host = parsed.hostname.toLowerCase();
	if (host !== "hub.vroid.com" && !host.endsWith(".vroid.com")) {
		throw new Error("Only hub.vroid.com model links are supported.");
	}

	const modelId = parsed.pathname.replace(/\/+$/, "").split("/").pop() ?? "";
	if (!/^\d+$/.test(modelId)) {
		throw new Error("That link does not contain a model id. Open the model page and copy its full URL.");
	}

	return { modelId, url: parsed.href };
}

// ---------------------------------------------------------------- job runner

async function startJob({ url, modelId }) {
	const job = {
		jobId: randomUUID(),
		url,
		modelId,
		status: "running",
		startedAt: Date.now(),
		finishedAt: null,
		error: null,
		errorKind: null,
	};

	const entry = {
		jobId: job.jobId,
		url,
		modelId,
		name: null,
		status: "running",
		startedAt: job.startedAt,
		finishedAt: null,
		fileName: null,
		filePath: null,
		size: null,
		error: null,
		errorKind: null,
		durationMs: null,
		logs: null,
	};

	currentJob = job;
	history.unshift(entry);
	history = history.slice(0, HISTORY_LIMIT);

	void saveHistory();
	broadcast({ type: "job", job });
	broadcast({ type: "history", history });

	addLog("info", `Requested model ${modelId}`);
	runJob(job, entry, logSeq - 1);

	return job;
}

// Classify a failure from the log lines the pipeline produced, so the UI can
// explain the common causes instead of echoing a bare error string.
function classifyFailure(logStart, message) {
	const text = logBuffer
		.filter((line) => line.seq > logStart)
		.map((line) => line.message.toLowerCase())
		.join("\n");

	if (text.includes("no vroid session cookie")) return "no-session";
	if (text.includes("optimized_preview") || text.includes("/preview")) return "no-preview";
	if (/\(404\)|not found/i.test(message)) return "no-preview";
	return null;
}

async function runJob(job, entry, logStart) {
	const restoreConsole = tapConsole();

	try {
		const result = await deobfuscateVRoidHubGLB(job.modelId);
		job.status = "success";

		if (result?.fileName) {
			job.fileName = result.fileName;
			job.filePath = result.filePath ?? null;
			job.size = result.size ?? null;
			job.modelName = result.modelName ?? null;
			entry.fileName = result.fileName;
			entry.filePath = result.filePath ?? null;
			entry.size = result.size ?? null;
			entry.name = result.modelName ?? null;
			addLog("success", `Saved downloads/${result.fileName} (${formatBytes(result.size)})`);
		} else {
			addLog("success", "Model saved to the downloads folder.");
		}
	} catch (err) {
		job.status = "error";
		job.error = err?.message || String(err);
		job.errorKind = classifyFailure(logStart, job.error);
		entry.error = job.error;
		entry.errorKind = job.errorKind;
		addLog("error", job.error);
	} finally {
		restoreConsole();

		job.finishedAt = Date.now();
		job.durationMs = job.finishedAt - job.startedAt;
		entry.status = job.status;
		entry.finishedAt = job.finishedAt;
		entry.durationMs = job.durationMs;
		entry.logs = logBuffer
			.filter((line) => line.seq > logStart)
			.slice(-80)
			.map(({ level, message, at }) => ({ level, message, at }));
		currentJob = null;

		await saveHistory();
		broadcast({ type: "job", job });
		broadcast({ type: "history", history });
	}
}

// ---------------------------------------------------------------- lifecycle

let shuttingDown = false;

function shutdown(reason) {
	if (shuttingDown) return;
	shuttingDown = true;

	process.stdout.write(`\n  ${reason}. Closing the server...\n\n`);

	// SSE responses keep the listener alive, so end them before closing.
	for (const res of clients) {
		try {
			res.end();
		} catch {
			// already disconnected
		}
	}
	clients.clear();

	server.close(() => process.exit(0));

	// Never hang on lingering keep-alive sockets.
	setTimeout(() => process.exit(0), 500);
}

function openBrowser(url) {
	const [command, args] =
		process.platform === "win32"
			? ["cmd", ["/c", "start", "", url]]
			: process.platform === "darwin"
				? ["open", [url]]
				: ["xdg-open", [url]];

	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
		child.on("error", () => {});
		child.unref();
	} catch {
		// Opening the browser is a convenience; the URL is printed anyway.
	}
}

// ---------------------------------------------------------------- HTTP handlers

function handleEvents(req, res) {
	res.writeHead(200, {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});

	res.write("retry: 1500\n\n");
	clients.add(res);
	sse(res, { type: "hello", job: currentJob, logs: logBuffer, history });

	req.on("close", () => {
		clients.delete(res);
	});
}

async function handleDownload(req, res) {
	const raw = await readBody(req);
	let payload = {};
	try {
		payload = raw ? JSON.parse(raw) : {};
	} catch {
		sendJson(res, 400, { error: "Malformed request." });
		return;
	}

	let target;
	try {
		target = parseTarget(payload.url);
	} catch (err) {
		sendJson(res, 400, { error: err.message });
		return;
	}

	if (currentJob) {
		sendJson(res, 409, { error: "A download is already running. Wait for it to finish." });
		return;
	}

	const job = await startJob(target);
	sendJson(res, 202, { job });
}

async function handleOpenDownloads(res) {
	try {
		await mkdir(DOWNLOADS_DIR, { recursive: true });

		// explorer.exe is picky about forward slashes in paths.
		const target = process.platform === "win32" ? DOWNLOADS_DIR.replace(/\//g, "\\") : DOWNLOADS_DIR;
		const command = process.platform === "win32"
			? "explorer.exe"
			: process.platform === "darwin"
				? "open"
				: "xdg-open";

		await launchDetached(command, [target]);

		sendJson(res, 200, { ok: true, path: DOWNLOADS_DIR });
	} catch (err) {
		sendJson(res, 500, { error: err?.message || "Could not open the downloads folder." });
	}
}

async function serveStatic(res, pathname) {
	const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
	const filePath = path.resolve(PUBLIC_DIR, relativePath);
	const relative = path.relative(PUBLIC_DIR, filePath);

	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		sendText(res, 403, "Forbidden");
		return;
	}

	if (!existsSync(filePath) || !statSync(filePath).isFile()) {
		sendText(res, 404, "Not found");
		return;
	}

	res.writeHead(200, {
		"Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
		"Cache-Control": "no-store",
	});
	createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://${req.headers.host || HOST}`);
	const { pathname } = url;

	try {
		if (pathname === "/api/events" && req.method === "GET") {
			handleEvents(req, res);
			return;
		}

		if (pathname === "/api/status" && req.method === "GET") {
			sendJson(res, 200, { job: currentJob, logs: logBuffer, history });
			return;
		}

		if (pathname === "/api/download" && req.method === "POST") {
			await handleDownload(req, res);
			return;
		}

		if (pathname === "/api/history" && req.method === "GET") {
			sendJson(res, 200, { history });
			return;
		}

		if (pathname === "/api/history/clear" && req.method === "POST") {
			// Keep an in-flight run visible; everything finished is dropped.
			history = history.filter((item) => item.status === "running");
			await saveHistory();
			broadcast({ type: "history", history });
			sendJson(res, 200, { ok: true, history });
			return;
		}

		if (pathname === "/api/session" && req.method === "GET") {
			sendJson(res, 200, await getVRoidSessionStatus());
			return;
		}

		if (pathname === "/api/library" && req.method === "GET") {
			sendJson(res, 200, await buildLibrary());
			return;
		}

		if (pathname === "/api/downloads/reveal" && req.method === "POST") {
			const payload = JSON.parse((await readBody(req)) || "{}");
			const target = resolveDownload(payload.name);
			if (!target || !existsSync(target.fullPath)) {
				sendJson(res, 404, { error: "That file is no longer in the downloads folder." });
				return;
			}
			try {
				await revealPath(target.fullPath);
			} catch (error) {
				sendJson(res, 500, {
					error: `Could not open the file manager: ${error?.message || "unknown error"}`,
				});
				return;
			}

			sendJson(res, 200, { ok: true });
			return;
		}

		if (pathname === "/api/downloads/delete" && req.method === "POST") {
			const payload = JSON.parse((await readBody(req)) || "{}");
			const target = resolveDownload(payload.name);
			if (!target || !existsSync(target.fullPath)) {
				sendJson(res, 404, { error: "That file is no longer in the downloads folder." });
				return;
			}
			await unlink(target.fullPath);
			sendJson(res, 200, { ok: true });
			return;
		}

		if (pathname === "/api/open-downloads" && req.method === "POST") {
			await handleOpenDownloads(res);
			return;
		}

		if (pathname === "/api/logs/clear" && req.method === "POST") {
			logBuffer.length = 0;
			broadcast({ type: "logs-cleared" });
			sendJson(res, 200, { ok: true });
			return;
		}

		if (pathname === "/api/shutdown" && req.method === "POST") {
			sendJson(res, 200, { ok: true });
			setTimeout(() => shutdown("Shut down from the web interface"), 150);
			return;
		}

		if (pathname.startsWith("/api/")) {
			sendJson(res, 404, { error: "Not found" });
			return;
		}

		await serveStatic(res, pathname);
	} catch (err) {
		sendJson(res, 500, { error: err?.message || "Unexpected error" });
	}
});

// Keep idle SSE connections from being dropped by the OS.
setInterval(() => {
	for (const res of clients) {
		try {
			res.write(": ping\n\n");
		} catch {
			clients.delete(res);
		}
	}
}, 15000).unref();

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		process.stdout.write(
			`\nPort ${PORT} is already in use. Close the other instance or run with PORT=4322.\n\n`,
		);
		process.exit(1);
	}
	throw err;
});

await mkdir(DOWNLOADS_DIR, { recursive: true });
await loadHistory();

server.listen(PORT, HOST, () => {
	process.stdout.write(
		`\n  VRoid Hub Downloader is running\n` +
			`  Open       \u2192  ${URL_BASE}\n` +
			`  Downloads  \u2192  ${DOWNLOADS_DIR}\n` +
			`  Stop       \u2192  the Shut down button in the page, or Ctrl+C here\n\n`,
	);

	if (OPEN_BROWSER) openBrowser(`${URL_BASE}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		shutdown(signal === "SIGINT" ? "Stopped with Ctrl+C" : "Server stopped");
	});
}
