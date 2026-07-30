import { Request, Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";

import { StatusCodes } from "http-status-codes";
import {
  createConversationSchema,
  listConversationsQuerySchema,
  paginationQuerySchema,
  renameConversationSchema,
  sendMessageSchema,
} from "./ai-router.schema";
import {
  assertHasBalance,
  createConversation,
  deleteConversation,
  fetchConversationMessages,
  getConversation,
  listConversations,
  renameConversation,
  sendMessageAndStream,
} from "./ai-router.service";
import { InsufficientBalanceError } from "../billing/billing.service";
import { AppError } from "../../utils/AppError";

/**
 * POST /api/chat/conversations
 * Creates a new empty conversation thread.
 */
export const createConversationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createConversationSchema.parse(req.body);
    const userId = req.user!.id;

    const conversation = await createConversation(
      userId,
      body.network,
      body.title,
    );

    res.status(StatusCodes.CREATED).json(conversation);
  },
);

/**
 * GET /api/chat/conversations
 * Lists the user's conversations for a given network, newest first.
 */
export const listConversationsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listConversationsQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const { conversations, total } = await listConversations(
      userId,
      query.network,
      query.limit,
      query.offset,
    );

    res.json({
      data: conversations,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  },
);

/**
 * GET /api/chat/conversations/:id
 * Fetches a single conversation's metadata.
 */
export const getConversationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const conversation = await getConversation(req.params.id as string, userId);

    res.json(conversation);
  },
);

/**
 * GET /api/chat/conversations/:id/messages
 * Fetches messages for a conversation, chronological, paginated.
 */
export const getMessagesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const { messages, total } = await fetchConversationMessages(
      req.params.id as string,
      userId,
      query.limit,
      query.offset,
    );

    res.json({
      data: messages,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  },
);

/**
 * POST /api/chat/conversations/:id/messages
 * Sends a message in a conversation thread and streams the AI response.
 */
export const sendMessageHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const body = sendMessageSchema.parse(req.body);
    const userId = req.user!.id;

    try {
      const result = await sendMessageAndStream({
        conversationId: req.params.id as string,
        userId,
        network: body.network,
        modelPricingId: body.modelPricingId,
        content: body.content,
      });

      result.pipeTextStreamToResponse(res);
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        throw new AppError(
          StatusCodes.PAYMENT_REQUIRED,
          "Your Router Wallet balance is empty. Please deposit USDC to continue.",
        );
      }

      throw error;
    }
  },
);
/**
 * PATCH /api/chat/conversations/:id
 * Renames a conversation (e.g. user editing the auto-generated title).
 */
export const renameConversationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const body = renameConversationSchema.parse(req.body);
    const userId = req.user!.id;

    const conversation = await renameConversation(
      req.params.id as string,
      userId,
      body.title,
    );

    res.json(conversation);
  },
);

/**
 * DELETE /api/chat/conversations/:id
 * Deletes a conversation and its messages (cascade).
 */
export const deleteConversationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    await deleteConversation(req.params.id as string, userId);

    res.status(StatusCodes.NO_CONTENT).send();
  },
);
