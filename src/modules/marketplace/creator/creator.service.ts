import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { prisma } from "../../../lib/prisma";
import { ErrorCodes } from "../../../errors/error-codes";
import {
  CreateCreatorProfileInput,
  UpdateCreatorProfileInput,
} from "./creator.schema";
import { CreatorProfile } from "../../../generated/prisma";

const registerCreatorProfile = async (
  userId: string,
  input: CreateCreatorProfileInput,
): Promise<CreatorProfile> => {
  const existingCreator = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (existingCreator) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Creator profile already exists",
      ErrorCodes.CREATOR_ALREADY_EXISTS,
    );
  }

  return prisma.creatorProfile.create({
    data: {
      userId,
      ...input,
    },
  });
};

const getCreatorProfile = async (userId: string) => {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  return profile;
};

const updateCreatorProfile = async (
  userId: string,
  input: UpdateCreatorProfileInput,
): Promise<CreatorProfile> => {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  return prisma.creatorProfile.update({
    where: { userId },
    data: { ...input },
  });
};

export const creatorService = {
  registerCreatorProfile,
  getCreatorProfile,
  updateCreatorProfile,
};
