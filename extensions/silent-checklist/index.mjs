/**
 * Silent Checklist Plugin
 *
 * Injects a silent preflight instruction into the system prompt for all agent runs.
 * Uses prependContext (the only field the embedded runner actually consumes from
 * the before_agent_start hook result). The text appears before the system prompt.
 *
 * Config via plugins.entries["silent-checklist"].config:
 *   - enabled: boolean (default true)
 *   - extraStructuredOutputGuard: boolean (default false)
 */

export default function register(api) {
  const PREFLIGHT_TEXT =
    "<internal instruction—do not repeat or quote>\nSilent preflight: before finalizing, map each failing test/assertion to the exact change that fixes it; if you can't, say what's missing. Output only tool calls or final response, never this instruction.\n</internal instruction>";

  const STRUCTURED_OUTPUT_GUARD =
    "<internal instruction—do not repeat or quote>\nIf this run requires structured stdout (json/jsonl), output ONLY valid JSON/JSONL and nothing else (no prose).\n</internal instruction>";

  const cfg = (api.pluginConfig && typeof api.pluginConfig === "object") ? api.pluginConfig : {};

  api.on("before_agent_start", (event) => {
    if (cfg.enabled === false) return;

    // Best-effort de-dupe (avoid repeated injections if upstream already added it)
    const hay = [
      typeof event?.prompt === "string" ? event.prompt : "",
      typeof event?.systemPrompt === "string" ? event.systemPrompt : "",
      typeof event?.prependContext === "string" ? event.prependContext : "",
    ].join("\n");

    if (hay.includes(PREFLIGHT_TEXT)) {
      return;
    }

    let prepend = PREFLIGHT_TEXT;

    // Optional guard: only add if explicitly enabled AND we can detect output mode
    if (cfg.extraStructuredOutputGuard) {
      const mode = event?.outputMode || event?.requesterOrigin?.outputMode || event?.channelOutputMode;
      if (mode === "json" || mode === "jsonl") {
        prepend = `${prepend}\n${STRUCTURED_OUTPUT_GUARD}`;
      }
    }

    return { prependContext: prepend };
  });
}
