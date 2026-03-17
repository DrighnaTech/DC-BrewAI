import { getToken } from "./auth";

export interface RouteInfo {
  name: string;
  models: string[];
  reason: string;
}

/**
 * Stream chat without file uploads (JSON body).
 */
export async function streamChat(
  sessionId: string,
  message: string,
  onDelta: (text: string) => void,
  onDone: (runId: string | null) => void,
  onError: (err: string) => void,
  onRoute?: (route: RouteInfo) => void,
  showThinking: boolean = false,
  model: string | null = null,
  mode: string = "auto"
) {
  const token = getToken();
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      show_thinking: showThinking,
      model: model || undefined,
      mode,
    }),
  });

  if (!res.ok || !res.body) {
    onError("Failed to connect to model");
    return;
  }

  await processSSE(res.body, onDelta, onDone, onError, onRoute);
}

/**
 * Stream chat with file uploads (multipart form).
 */
export async function streamChatWithFiles(
  sessionId: string,
  message: string,
  files: File[],
  onDelta: (text: string) => void,
  onDone: (runId: string | null) => void,
  onError: (err: string) => void,
  onRoute?: (route: RouteInfo) => void,
  showThinking: boolean = false,
  mode: string = "auto"
) {
  const token = getToken();
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("message", message);
  formData.append("show_thinking", String(showThinking));
  formData.append("mode", mode);
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch("/api/chat/stream-with-files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok || !res.body) {
    onError("Failed to connect to model");
    return;
  }

  await processSSE(res.body, onDelta, onDone, onError, onRoute);
}

/**
 * Shared SSE processor for both endpoints.
 */
async function processSSE(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  onDone: (runId: string | null) => void,
  onError: (err: string) => void,
  onRoute?: (route: RouteInfo) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          onError(parsed.error);
          return;
        }
        if (parsed.route && onRoute) {
          onRoute(parsed.route);
        }
        if (parsed.delta) {
          onDelta(parsed.delta);
        }
        if (parsed.done) {
          onDone(parsed.run_id ?? null);
          return;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}
