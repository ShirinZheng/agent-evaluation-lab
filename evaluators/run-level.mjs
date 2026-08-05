import { score } from "./shared.mjs";

export function evaluateRun({ exitCode, timedOut, parsed, durationMs }) {
  return [
    score("process_success", exitCode === 0 && !timedOut ? 1 : 0, `exit=${exitCode}; timed_out=${timedOut}`),
    score("json_parse_success", parsed ? 1 : 0, parsed ? "Final message parsed as JSON." : "Final message was not valid JSON."),
    score("within_timeout", timedOut ? 0 : 1, `duration_ms=${durationMs}`)
  ];
}
