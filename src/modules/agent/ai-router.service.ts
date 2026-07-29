import { streamText } from "ai";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import {
  deductUsage,
  InsufficientBalanceError,
} from "../billing/billing.service";
import { randomUUID } from "crypto";
import { AppError } from "../../utils/AppError";
import { triggerSweep } from "../billing/sweep.service";
import { getProviderModel } from "./provider-registry";
import { NetworkEnv } from "../../generated/prisma";

interface SendMessageInput {
  conversationId: string;
  userId: string;
  network: NetworkEnv;
  modelPricingId: string;
  content: string;
}

/**
 * Resolves the model/provider for a request and validates the pricing
 * snapshot is still active. Throws before any provider call is made,
 * so we never bill or stream against a stale/inactive price.
 */
async function resolveModel(modelPricingId: string) {
  const pricing = await prisma.modelPricing.findUnique({
    where: { id: modelPricingId },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (!pricing) {
    throw new AppError(StatusCodes.NOT_FOUND, "Model pricing not found");
  }
  if (!pricing.aiModel.isActive) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This model is no longer available",
    );
  }
  if (pricing.effectiveTo && pricing.effectiveTo < new Date()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Pricing snapshot expired, refetch /api/models",
    );
  }

  return pricing;
}

/**
 * Verifies the conversation exists and belongs to the requesting user.
 * Prevents cross-user access via a guessed/leaked conversation ID.
 */
async function assertConversationOwnership(
  conversationId: string,
  userId: string,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  if (conversation.userId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
  }

  return conversation;
}

/**
 * Creates a new conversation for a user.
 */
export async function createConversation(
  userId: string,
  network: NetworkEnv,
  title?: string,
) {
  return prisma.conversation.create({
    data: { userId, network, title: title?.trim() || "New Chat" },
  });
}

/**
 * Lists a user's conversations, newest first, with message counts for
 * sidebar display. Scoped to a single network so testnet/mainnet
 * conversations never mix.
 */
export async function listConversations(
  userId: string,
  network: NetworkEnv,
  limit: number,
  offset: number,
) {
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId, network },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.conversation.count({ where: { userId, network } }),
  ]);

  return { conversations, total };
}

/**
 * Fetches a single conversation's metadata (for header display, title, etc).
 */
export async function getConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { _count: { select: { messages: true } } },
  });

  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  if (conversation.userId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
  }

  return conversation;
}

/**
 * Fetches messages for a conversation in chronological order (paginated).
 * Ownership is checked here so this can be called directly from a route
 * without a separate guard.
 */
export async function fetchConversationMessages(
  conversationId: string,
  userId: string,
  limit: number,
  offset: number,
) {
  await assertConversationOwnership(conversationId, userId);

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.message.count({ where: { conversationId } }),
  ]);

  return { messages, total };
}

/**
 * Deletes a conversation (and its messages, via cascade) after verifying
 * ownership.
 */
export async function deleteConversation(
  conversationId: string,
  userId: string,
) {
  await assertConversationOwnership(conversationId, userId);
  await prisma.conversation.delete({ where: { id: conversationId } });
}

/**
 * Renames a conversation after verifying ownership.
 */
export async function renameConversation(
  conversationId: string,
  userId: string,
  title: string,
) {
  await assertConversationOwnership(conversationId, userId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { title: title.trim() },
  });
}

/**
 * Persists the user's message immediately, before the AI call starts.
 * Done outside the stream so the message is never lost even if the
 * provider call fails.
 */
async function saveUserMessage(conversationId: string, content: string) {
  return prisma.message.create({
    data: { conversationId, role: "user", content },
  });
}

/**
 * Loads recent conversation history to give the model context, most
 * recent N messages, returned in chronological order for the prompt.
 */
async function loadRecentHistory(conversationId: string, take: number) {
  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { role: true, content: true },
  });

  return recent.reverse();
}

/**
 * Streams an AI response within a conversation thread and, once complete,
 * atomically bills the user and persists the assistant message. The
 * client stream is never blocked by billing/history writes — those
 * happen in onFinish, off the response path.
 */
export async function sendMessageAndStream(input: SendMessageInput) {
  const { conversationId, userId, network, modelPricingId, content } = input;

  await assertConversationOwnership(conversationId, userId);

  const pricing = await resolveModel(modelPricingId);
  const model = getProviderModel(
    pricing.aiModel.aiProvider.name,
    pricing.aiModel.modelName,
  );

  // Save the user's message before calling the provider, so it's never
  // lost even if the AI call fails downstream.
  await saveUserMessage(conversationId, content);

  // Pull recent history (last 5 exchanges) so the model has context.
  // This includes the user message just saved above.
  const history = await loadRecentHistory(conversationId, 10);
  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const isFirstExchange = history.length === 1;

  // Idempotency key generated per request — protects against duplicate
  // billing if onFinish somehow fires twice (SDK retry, process restart, etc).
  const idempotencyKey = randomUUID();

  const result = streamText({
    model,
    messages,
    onFinish: async ({ text, usage }) => {
      try {
        const deductResult = await deductUsage({
          userId,
          network,
          modelPricingId,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          idempotencyKey,
        });

        // ── sweep trigger ─────────────────────────────────────────────────
        if (deductResult.sweepTriggered && deductResult.sweepAmount) {
          void triggerSweep({
            userId,
            network,
            amountUsdc: deductResult.sweepAmount,
          });
        }

        await prisma.message.create({
          data: {
            conversationId,
            role: "assistant",
            content: text,
            modelPricingId,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            usageLogId: deductResult.usageLogId,
          },
        });

        // Auto-title the conversation from the first user message, same
        // as most chat products (ChatGPT/Claude) — only on first exchange.
        if (isFirstExchange) {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { title: content.slice(0, 50).trim() || "New Chat" },
          });
        }

        logger.info(
          {
            userId,
            conversationId,
            modelPricingId,
            cost: deductResult.costUsdc,
          },
          "Message streamed, billed, and saved",
        );
      } catch (error) {
        // Response already streamed to the client at this point — we can't
        // undo that. Log loudly so ops can reconcile/refund manually if this
        // was a genuine billing failure (e.g. insufficient balance race).
        logger.error(
          { err: error, userId, conversationId, modelPricingId },
          "CRITICAL: failed to bill/save assistant message after streaming response to client",
        );
      }
    },
  });

  return result;
}

export async function assertHasBalance(
  userId: string,
  network: NetworkEnv,
): Promise<void> {
  const balance = await prisma.balance.findUnique({
    where: { userId_network: { userId, network } },
  });

  if (!balance || balance.amount.lessThanOrEqualTo(0)) {
    throw new InsufficientBalanceError(
      userId,
      "> 0",
      balance?.amount.toString() ?? "0",
    );
  }
}
