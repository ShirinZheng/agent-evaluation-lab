import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

function redact(value) {
  if (typeof value === "string") {
    return value
      .replace(/sk-lf-[a-z0-9_-]+/giu, "[REDACTED_LANGFUSE_SECRET]")
      .replace(/(password[=: ]+)[^\s,;]+/giu, "$1[REDACTED]")
      .replace(/(bearer\s+)[a-z0-9._-]+/giu, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /^(secret|secret_key|password|access_token|refresh_token|authorization)$/iu.test(key) ? "[REDACTED]" : redact(item)
    ]));
  }
  return value;
}

export function makeClient() {
  return new LangfuseClient({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || "http://localhost:3000",
    timeout: 5
  });
}

export async function checkLangfuse() {
  const client = makeClient();
  try {
    const health = await client.api.health.health({ timeoutInSeconds: 3, maxRetries: 0 });
    return { connected: true, health };
  } catch (error) {
    return { connected: false, error: error.message };
  } finally {
    await client.shutdown().catch(() => {});
  }
}

export function startLangfuseTracing(snapshotId) {
  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || "http://localhost:3000",
    environment: "local-evaluation",
    release: snapshotId,
    exportMode: "immediate",
    mediaUploadEnabled: false,
    mask: ({ data }) => redact(data)
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();
  return { processor, provider };
}

export function asLangfuseScores(rows) {
  return rows.map(({ name, value, comment, details }) => ({
    name,
    value,
    comment,
    ...(details === undefined ? {} : { metadata: { details } })
  }));
}
