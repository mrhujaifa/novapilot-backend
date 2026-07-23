/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

// Circle public key cache (এক request-এ বার বার fetch না করার জন্য)
let cachedPublicKey: string | null = null;
let cacheExpiresAt = 0;

async function getCirclePublicKey(): Promise<string> {
  const now = Date.now();
  if (cachedPublicKey && now < cacheExpiresAt) {
    return cachedPublicKey;
  }

  const res = await fetch("https://api.circle.com/v2/notifications/publicKey", {
    headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Circle public key: ${res.status}`);
  }

  const data = await res.json();
  cachedPublicKey = data.data.publicKey;
  cacheExpiresAt = now + 60 * 60 * 1000; // ১ ঘন্টা cache

  return cachedPublicKey!;
}

/**
 * Circle webhook signature verify করে raw body-র উপর।
 * Signature header: "X-Circle-Signature" (base64 ECDSA signature)
 */
export async function verifyCircleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers["x-circle-signature"] as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined; // express.json()-এ verify hook দিয়ে সেট করা লাগবে

    if (!signature || !rawBody) {
      logger.warn("Missing Circle webhook signature or raw body");
      res.status(401).json({ error: "Missing signature" });
      return;
    }

    const publicKey = await getCirclePublicKey();

    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();

    const isValid = verifier.verify(publicKey, signature, "base64");

    if (!isValid) {
      logger.warn("Invalid Circle webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "Circle webhook verification failed");
    res.status(500).json({ error: "Webhook verification error" });
  }
}
