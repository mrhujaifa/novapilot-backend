import { StatusCodes } from "http-status-codes";
import { AppError } from "../errors/AppError";
import { ErrorCodes } from "../errors/error-codes";
import { NetworkEnv } from "../generated/prisma";

export function parseNetworkQuery(network: unknown): NetworkEnv {
  if (
    typeof network !== "string" ||
    !Object.values(NetworkEnv).includes(network as NetworkEnv)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Valid network query parameter is required",
      ErrorCodes.INVALID_NETWORK,
    );
  }
  return network as NetworkEnv;
}
