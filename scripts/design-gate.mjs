#!/usr/bin/env node
/**
 * design-gate: CI gate that enforces the design-first loop.
 *
 * Calls get_compliance_report on a project-design MCP server and exits non-zero
 * when the gate fails, so a pipeline can block merges on unreported, blocked or
 * stale agent work. Zero dependencies (plain fetch + JSON-RPC over Streamable
 * HTTP); needs node >= 18.
 *
 *   export PROJECT_DESIGN_TOKEN=pd_…
 *   node scripts/design-gate.mjs --url https://pd.example.com/api/mcp \
 *     --project team-tasks --min-done 100 --fail-on-blocked
 *
 * Exit codes: 0 gate PASS, 1 gate FAIL, 2 usage or transport error.
 */

import { pathToFileURL } from "node:url";

function usage() {
  return [
    "usage: design-gate.mjs [options]",
    "",
    "  --url URL            MCP endpoint (or PROJECT_DESIGN_URL; default http://localhost:3000/api/mcp)",
    "  --token TOKEN        bearer token (or PROJECT_DESIGN_TOKEN)",
    "  --project SLUG       project slug (optional for scoped/single-project tokens)",
    "  --version REF        draft (default), latest or a version number",
    "  --min-done N         gate fails below N% done steps (default 0)",
    "  --fail-on-blocked    gate fails when any step is blocked",
    "  --fail-on-stale      gate fails when any in_progress step is stale",
    "  --stale-hours N      stale threshold in hours (default 24)",
    "  --timeout MS         HTTP timeout in ms (default 60000)",
    "  --help               this text",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    const key = a.slice(2);
    if (key === "fail-on-blocked" || key === "fail-on-stale") {
      out[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`missing value for ${a}`);
    out[key] = value;
  }
  return out;
}

/** Read one JSON-RPC response message from the body (plain JSON or SSE stream). */ async function readMessage(
  res,
) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    const payload = JSON.parse(await res.text());
    return payload;
  }
  // SSE streams stay open; resolve on the first complete response message.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const payload = JSON.parse(data);
            if (
              payload &&
              typeof payload === "object" &&
              ("result" in payload || "error" in payload)
            ) {
              return payload;
            }
          } catch {
            // Partial line: keep buffering.
          }
        }
      }
      if (done) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }
  throw new Error("empty SSE response");
}

/** POST one JSON-RPC message; understands plain JSON and SSE responses. */
async function rpc(fetchImpl, url, token, session, body, timeoutMs) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (session) headers["mcp-session-id"] = session;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
  const nextSession = res.headers.get("mcp-session-id") ?? session;
  if (res.status === 202) {
    clearTimeout(timer);
    try {
      await res.body?.cancel();
    } catch {
      // Ignore.
    }
    return { session: nextSession, result: null };
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  try {
    const payload = await readMessage(res);
    if (payload.error) {
      const err = new Error(payload.error.message ?? "JSON-RPC error");
      err.code = payload.error.code;
      err.data = payload.error.data;
      throw err;
    }
    return { session: nextSession, result: payload.result ?? null };
  } finally {
    clearTimeout(timer);
  }
}

async function callTool(url, token, timeoutMs, name, args, fetchImpl = fetch) {
  let session = null;
  let init;
  try {
    ({ session, result: init } = await rpc(
      fetchImpl,
      url,
      token,
      session,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "design-gate", version: "0.1.0" },
        },
      },
      timeoutMs,
    ));
  } catch (error) {
    // Negotiate down/up when the server advertises other versions.
    const supported = error?.data?.supportedVersions;
    if (!Array.isArray(supported) || supported.length === 0) throw error;
    ({ session, result: init } = await rpc(
      fetchImpl,
      url,
      token,
      session,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: supported[0],
          capabilities: {},
          clientInfo: { name: "design-gate", version: "0.1.0" },
        },
      },
      timeoutMs,
    ));
  }
  if (!init) throw new Error("no initialize response");
  await rpc(
    fetchImpl,
    url,
    token,
    session,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    timeoutMs,
  );
  const { result } = await rpc(
    fetchImpl,
    url,
    token,
    session,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
    timeoutMs,
  );
  if (!result || result.isError) {
    const text = result?.content?.[0]?.text ?? "tool call failed";
    throw new Error(text);
  }
  return result.content?.[0]?.text ?? "";
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} environment
 */
async function main(argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return 2;
  }
  if (opts.help) {
    console.log(usage());
    return 0;
  }
  const url = opts.url ?? environment.PROJECT_DESIGN_URL ?? "http://localhost:3000/api/mcp";
  const token = opts.token ?? environment.PROJECT_DESIGN_TOKEN;
  if (!token) {
    console.error("error: missing token (--token or PROJECT_DESIGN_TOKEN)\n\n" + usage());
    process.exitCode = 2;
    return 2;
  }
  const toolArgs = { version: opts.version ?? "draft" };
  if (opts.project !== undefined) toolArgs.project = opts.project;
  if (opts["min-done"] !== undefined) {
    const n = Number(opts["min-done"]);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      console.error("error: --min-done must be 0-100");
      process.exitCode = 2;
      return 2;
    }
    toolArgs.minDonePercent = n;
  }
  if (opts["fail-on-blocked"]) toolArgs.failOnBlocked = true;
  if (opts["fail-on-stale"]) toolArgs.failOnStale = true;
  if (opts["stale-hours"] !== undefined) {
    const n = Number(opts["stale-hours"]);
    if (!Number.isFinite(n) || n <= 0) {
      console.error("error: --stale-hours must be positive");
      process.exitCode = 2;
      return 2;
    }
    toolArgs.staleHours = n;
  }
  const timeoutMs = opts.timeout !== undefined ? Number(opts.timeout) : 60000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error("error: --timeout must be positive");
    process.exitCode = 2;
    return 2;
  }

  let raw;
  try {
    raw = await callTool(url, token, timeoutMs, "get_compliance_report", toolArgs, fetchImpl);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 2;
    return 2;
  }
  let res;
  try {
    res = JSON.parse(raw);
  } catch {
    console.error("error: tool returned non-JSON");
    process.exitCode = 2;
    return 2;
  }
  console.log(res.summary ?? JSON.stringify(res.report ?? res, null, 2));
  if (res.report?.gate?.pass) {
    process.exitCode = 0;
    return 0;
  } else {
    console.error("GATE: FAIL");
    process.exitCode = 1;
    return 1;
  }
}

export { callTool, main, parseArgs, usage };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
