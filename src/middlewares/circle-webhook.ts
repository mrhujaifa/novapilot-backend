/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { logger } from "../lib/logger";
import { env } from "../config/env.config";
import { sendApiResponse } from "../utils/sendApiResponse";
import { ErrorCodes } from "../errors/error-codes";

/**
 * Verifies that an incoming Circle webhook request is authentic —
 * confirms the signature matches Circle's public key for the given
 * key ID, using the raw (unparsed) request body.
 */
export async function verifyCircleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.headers["x-circle-signature"] as string | undefined;
    const keyId = req.headers["x-circle-key-id"] as string | undefined;
    // rawBody must be captured by an earlier middleware (e.g. express.raw()) —
    // signature verification requires the exact bytes Circle signed, not the parsed JSON.
    const rawBody = (req as any).rawBody as Buffer | undefined;

    if (!signature || !keyId || !rawBody) {
      logger.warn("Missing Circle webhook signature, key ID, or raw body");
      sendApiResponse(res, {
        httpStatusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: "Missing signature or key ID",
        code: ErrorCodes.WEBHOOK_SIGNATURE_MISSING,
      });
      return;
    }

    const publicKey = await getCirclePublicKey(keyId);

    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();

    const isValid = verifier.verify(publicKey, signature, "base64");

    if (!isValid) {
      logger.warn("Invalid Circle webhook signature");
      sendApiResponse(res, {
        httpStatusCode: StatusCodes.UNAUTHORIZED,
        success: false,
        message: "Invalid signature",
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "Circle webhook verification failed");
    sendApiResponse(res, {
      httpStatusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      success: false,
      message: "Webhook verification error",
      code: ErrorCodes.WEBHOOK_PROCESSING_FAILED,
    });
  }
}

/**
 * Fetches Circle's public key for a given key ID and converts it into a
 * Node-native KeyObject usable by crypto.verify().
 */
async function getCirclePublicKey(keyId: string): Promise<crypto.KeyObject> {
  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    {
      headers: {
        Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Circle public key: ${response.status}`);
  }

  const data = await response.json();
  const publicKeyBase64 = data.data.publicKey;

  // Circle returns a raw base64 SPKI key — convert to a Node KeyObject for crypto.verify()
  return crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
}
