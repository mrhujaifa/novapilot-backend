import https from "https";
import http from "http";
import { Response } from "express";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

export const executeHttpRequest = (
  builtRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
  res: Response,
  onComplete: (statusCode: number, latencyMs: number) => void,
  onError: (error: Error) => void,
  startTime: number,
): void => {
  const targetUrl = new URL(builtRequest.url);
  const protocol = targetUrl.protocol === "https:" ? https : http;

  const proxyReq = protocol.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: builtRequest.method,
      headers: builtRequest.headers,
    },
    (proxyRes) => {
      const latencyMs = Date.now() - startTime;
      const statusCode = proxyRes.statusCode ?? 200;

      // Response headers forward
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!HOP_BY_HOP.has(key.toLowerCase()) && typeof value === "string") {
          responseHeaders[key] = value;
        }
      }

      res.writeHead(statusCode, responseHeaders);
      proxyRes.pipe(res);

      proxyRes.on("end", () => {
        onComplete(statusCode, latencyMs);
      });
    },
  );

  proxyReq.on("error", onError);

  if (builtRequest.body) {
    proxyReq.write(builtRequest.body);
  }

  proxyReq.end();
};
