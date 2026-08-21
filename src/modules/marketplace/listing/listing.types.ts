import {
  ApiListingStatus,
  ApiPricingModel,
  NetworkEnv,
} from "../../../generated/prisma";

export interface IApiListing {
  id: string;
  creatorId: string;

  apiName: string;
  apiSlug: string;
  description: string;
  category: string;

  // Original provider endpoint; used internally by the proxy.
  targetOriginUrl: string;

  // Public endpoint consumers use to access the API.
  proxyEndpointUrl: string;

  pricingModel: ApiPricingModel;
  status: ApiListingStatus;

  // Usage and reliability metrics.
  reportCount: number;
  successfulCalls: number;

  // Prisma Decimal is serialized as string to preserve precision.
  uptimePercent: string;

  avgLatencyMs: number;
  network: NetworkEnv;

  createdAt: Date;
  updatedAt: Date;
}

export interface IApiPriceVersion {
  id: string;
  apiId: string;

  // Decimal values are represented as strings to avoid precision loss.
  costPer1kCalls: string;

  effectiveFrom: Date;
  effectiveUntil: Date | null;

  // Marks the currently active pricing version.
  isCurrent: boolean;
}

export interface IApiCredential {
  id: string;
  apiId: string;

  headerName: string;
  isActive: boolean;

  createdAt: Date;
  rotatedAt: Date | null;

  // Encrypted credential value is intentionally excluded from API responses.
}
