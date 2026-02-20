/**
 * Claude Usage Bridge — Two-Step Protocol
 *
 * CSP on claude.ai blocks direct POSTs to localhost, so the bridge works in 2 steps:
 *
 * Step 1 (Chrome MCP → claude.ai tab):
 *   Inject this JS to fetch usage data and store it on `window.__claude_usage`:
 *
 *   fetch('/api/organizations/af462b73-6b17-4590-87a4-018925b5abb5/usage')
 *     .then(r => r.json())
 *     .then(data => { window.__claude_usage = JSON.stringify({
 *       five_hour: data.five_hour,
 *       seven_day: data.seven_day,
 *       seven_day_sonnet: data.seven_day_sonnet
 *     }); });
 *
 * Step 2 (read window.__claude_usage, then curl to HOD):
 *   Read `window.__claude_usage` via Chrome MCP javascript_tool,
 *   then POST the JSON string to http://localhost:4000/usage/claude
 *
 * The org ID (af462b73-...) is Zeb's Claude org. If this changes, update here
 * and in the hook script.
 *
 * Refresh frequency: once per session is usually enough (data changes slowly).
 * Session utilization resets every 5 hours, weekly resets Monday.
 */
