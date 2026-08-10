import type { ModelMessage } from "ai";

export function splitSystemMessages(
  messages: ModelMessage[] | undefined,
  maxMessages = 50,
) {
  const systemParts: string[] = [];
  const rest: ModelMessage[] = [];

  for (const m of messages ?? []) {
    if (m.role === "system") systemParts.push(m.content);
    else rest.push(m);
  }

  const instructions = systemParts.length
    ? systemParts.join("\n\n")
    : undefined;

  const trimmed = rest.length > maxMessages ? rest.slice(-maxMessages) : rest;

  return { instructions, messages: trimmed } as {
    instructions?: string;
    messages: ModelMessage[];
  };
}
