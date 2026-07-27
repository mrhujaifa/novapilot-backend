import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

export async function verifyCircleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.headers["x-circle-signature"] as string | undefined;
    const keyId = req.headers["x-circle-key-id"] as string | undefined; // ১. হেডার থেকে keyId সংগ্রহ করা হলো
    const rawBody = (req as any).rawBody as Buffer | undefined;

    if (!signature || !keyId || !rawBody) {
      logger.warn("Missing Circle webhook signature, key ID, or raw body");
      res.status(401).json({ error: "Missing signature or key ID" });
      return;
    }

    // ২. এখানে keyId পাস করা হয়েছে
    const publicKey = await getCirclePublicKey(keyId);

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

async function getCirclePublicKey(keyId: string): Promise<crypto.KeyObject> {
  const response = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
    headers: {
      Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Circle public key: ${response.status}`);
  }

  const data = await response.json();
  const publicKeyBase64 = data.data.publicKey;

  // ৩. Circle-এর raw base64 কি-কে Node.js উপযোগী KeyObject-এ রূপান্তর করা হলো
  return crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
}
