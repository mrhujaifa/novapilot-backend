import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";
import {
  createConversationSchema,
  listConversationsQuerySchema,
  paginationQuerySchema,
  renameConversationSchema,
  sendMessageSchema,
} from "./ai-router.schema";
import {
  createConversation,
  deleteConversation,
  fetchConversationMessages,
  getConversation,
  listConversations,
  renameConversation,
  sendMessageAndStream,
} from "./ai-router.service";

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

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.CREATED,
      success: true,
      message: "Conversation created successfully",
      data: conversation,
    });
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

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Conversations fetched successfully",
      data: conversations,
      meta: {
        page: Math.floor(query.offset / query.limit) + 1,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
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

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Conversation fetched successfully",
      data: conversation,
    });
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

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Messages fetched successfully",
      data: messages,
      meta: {
        page: Math.floor(query.offset / query.limit) + 1,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  },
);

/**
 * POST /api/chat/conversations/:id/messages
 * Sends a message in a conversation thread and streams the AI response.
 *
 * No sendApiResponse here by design — this is a raw text stream, not a
 * JSON response. assertHasBalance() runs inside sendMessageAndStream()
 * before any provider call, so InsufficientBalanceError (already an
 * AppError with PAYMENT_REQUIRED + INSUFFICIENT_BALANCE) propagates
 * straight to globalErrorHandler without needing a catch here.
 */
export const sendMessageHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const body = sendMessageSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await sendMessageAndStream({
      conversationId: req.params.id as string,
      userId,
      network: body.network,
      modelPricingId: body.modelPricingId,
      content: body.content,
    });

    result.pipeTextStreamToResponse(res);
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

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Conversation renamed successfully",
      data: conversation,
    });
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
