import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../errors/AppError";
import { ErrorCodes } from "../errors/error-codes";
import { prisma } from "../lib/prisma";

export const requireCreator = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Authentication required",
        ErrorCodes.AUTH_UNAUTHORIZED,
      );
    }

    const creator = await prisma.creatorProfile.findUnique({
      where: { userId },
      select: {
        id: true,
      },
    });

    if (!creator) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Creator access required",
        ErrorCodes.CREATOR_ACCESS_REQUIRED,
      );
    }

    req.creatorId = creator.id;

    next();
  } catch (error) {
    next(error);
  }
};
