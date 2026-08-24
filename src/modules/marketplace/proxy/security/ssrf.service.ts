import { isIP } from "net";
import dns from "dns/promises";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../../errors/AppError";
import { ErrorCodes } from "../../../../errors/error-codes";

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

const isPrivateIp = (ip: string): boolean =>
  PRIVATE_RANGES.some((r) => r.test(ip));

export const validateSsrf = async (url: string): Promise<void> => {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Only HTTPS targets are allowed",
      ErrorCodes.SSRF_BLOCKED,
    );
  }

  const hostname = parsed.hostname;

  // Direct IP block
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Private IP addresses are not allowed",
        ErrorCodes.SSRF_BLOCKED,
      );
    }
    return;
  }

  // DNS resolve করে IP check — DNS rebinding protection
  const addresses = await dns.resolve4(hostname).catch(() => []);
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Target URL resolves to a private IP address",
        ErrorCodes.SSRF_BLOCKED,
      );
    }
  }
};
