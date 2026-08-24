import { resolvePathTemplate } from "./variable-resolver";
import { AppliedAuth } from "./auth-engine";

export interface RequestSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathTemplate: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: {
    type: "json" | "form";
    source: "consumer" | "static";
    value?: unknown;
  } | null;
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Hop-by-hop headers — forward করা যাবে না
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailers",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "content-encoding",
  "content-length",
  "host",
  "authorization",
]);

export const buildRequest = (
  targetBaseUrl: string,
  requestSpec: RequestSpec,
  auth: AppliedAuth,
  consumerPath: string,
  consumerQuery: Record<string, string>,
  consumerHeaders: Record<string, string>,
  consumerBody: unknown,
): BuiltRequest => {
  // Path variables — auth path vars + consumer path vars merge
  const allPathVars = { ...auth.pathVars };

  // Consumer path থেকে dynamic segments extract
  const templateParts = requestSpec.pathTemplate.split("/").filter(Boolean);
  const consumerParts = consumerPath.split("/").filter(Boolean);
  templateParts.forEach((part, i) => {
    if (part.startsWith("{") && part.endsWith("}")) {
      const varName = part.slice(1, -1);
      // auth path var already আছে → skip (credential)
      if (!allPathVars[varName] && consumerParts[i]) {
        allPathVars[varName] = consumerParts[i];
      }
    }
  });

  // Path resolve
  const resolvedPath = resolvePathTemplate(
    requestSpec.pathTemplate,
    allPathVars,
  );

  // Query params — spec + auth + consumer merge
  const queryParams = new URLSearchParams({
    ...(requestSpec.query ?? {}),
    ...auth.query,
    ...consumerQuery,
  });

  const queryString = queryParams.toString();
  const url = `${targetBaseUrl}${resolvedPath}${queryString ? `?${queryString}` : ""}`;

  // Headers — consumer (filtered) + spec + auth merge
  const headers: Record<string, string> = {};

  // Consumer headers — hop-by-hop বাদ দিয়ে
  for (const [key, value] of Object.entries(consumerHeaders)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  // Spec headers override
  if (requestSpec.headers) {
    Object.assign(headers, requestSpec.headers);
  }

  // Auth headers override (highest priority)
  Object.assign(headers, auth.headers);

  // Body
  let body: string | undefined;
  if (requestSpec.body?.source === "consumer" && consumerBody) {
    body =
      typeof consumerBody === "string"
        ? consumerBody
        : JSON.stringify(consumerBody);
  }

  return {
    url,
    method: requestSpec.method,
    headers,
    body,
  };
};
