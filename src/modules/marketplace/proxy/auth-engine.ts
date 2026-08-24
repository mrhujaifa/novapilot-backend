import crypto from "crypto";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";
import { StatusCodes } from "http-status-codes";

export interface AuthSpec {
  type:
    | "none"
    | "api_key_header"
    | "api_key_query"
    | "api_key_path"
    | "api_key_cookie"
    | "bearer"
    | "basic"
    | "custom_header";
  location?: string;
  name?: string;
  prefix?: string;
  credentialRef?: string;
}

export interface AppliedAuth {
  headers: Record<string, string>;
  query: Record<string, string>;
  pathVars: Record<string, string>;
}

// Encrypted credential decrypt করা
const decryptCredential = (encryptedData: string): Record<string, string> => {
  const [ivHex, encryptedHex] = encryptedData.split(":");
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
};

// Credential encrypt করা
export const encryptCredential = (data: Record<string, string>): string => {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

export const applyAuth = (
  authSpec: AuthSpec | null,
  encryptedData: string | null,
): AppliedAuth => {
  const result: AppliedAuth = {
    headers: {},
    query: {},
    pathVars: {},
  };

  if (!authSpec || authSpec.type === "none" || !encryptedData) {
    return result;
  }

  const credential = decryptCredential(encryptedData);

  switch (authSpec.type) {
    case "api_key_header":
      result.headers[authSpec.name ?? "X-API-Key"] = credential.value;
      break;

    case "api_key_query":
      result.query[authSpec.name ?? "api_key"] = credential.value;
      break;

    case "api_key_path":
      result.pathVars[authSpec.name ?? "apiKey"] = credential.value;
      break;

    case "api_key_cookie":
      result.headers["Cookie"] =
        `${authSpec.name ?? "api_key"}=${credential.value}`;
      break;

    case "bearer":
      result.headers["Authorization"] = `Bearer ${credential.token}`;
      break;

    case "basic": {
      const encoded = Buffer.from(
        `${credential.username}:${credential.password}`,
      ).toString("base64");
      result.headers["Authorization"] = `Basic ${encoded}`;
      break;
    }

    case "custom_header": {
      const value = authSpec.prefix
        ? `${authSpec.prefix} ${credential.value}`
        : credential.value;
      result.headers[authSpec.name ?? "X-Custom-Token"] = value;
      break;
    }

    default:
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Unsupported auth type: ${authSpec.type}`,
        ErrorCodes.API_NOT_FOUND,
      );
  }

  return result;
};
