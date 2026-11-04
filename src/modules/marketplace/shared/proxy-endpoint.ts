import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";

export const proxyEndpointFor = (slug: string): string => {
  const base = process.env.PROXY_BASE_URL;
  if (!base) throw new AppError(503, "Marketplace proxy URL is not configured", ErrorCodes.SERVICE_UNAVAILABLE, { expose: true });
  const url = new URL(base);
  url.pathname = `/api/v1/marketplace/${encodeURIComponent(slug)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
};
