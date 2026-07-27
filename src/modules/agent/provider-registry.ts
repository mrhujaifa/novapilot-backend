import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const api = process.env.OPENROUTER_API_KEY!;

const openrouter = createOpenRouter({
  apiKey: api,
});

export function getProviderModel(provider: string, modelName: string) {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return anthropic(modelName);

    case "openai":
      return openai(modelName);

    case "google":
      return google(modelName);

    case "openrouter":
      return openrouter(modelName);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
