import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../src/config/env.config", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("redis")>();
  return {
    ...actual,
    createClient: vi.fn(() => {
      const client = Object.assign(new EventEmitter(), {
        isOpen: false,
        isReady: false,
        connect: vi.fn(async () => { client.isOpen = true; }),
      });
      return client;
    }),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

async function setup() {
  const redis = await import("../src/lib/redis");
  // The fake client has writable connection flags for lifecycle simulation.
  const client = redis.redisClient as unknown as EventEmitter & {
    isOpen: boolean;
    isReady: boolean;
    connect: ReturnType<typeof vi.fn>;
  };
  const ready = () => {
    client.isReady = true;
    client.emit("ready");
  };
  return { ...redis, client, ready };
}

describe("Redis connection recovery", () => {
  it("shares one connection attempt and waits for ready across concurrent callers", async () => {
    const { connectRedis, client, ready } = await setup();
    const pending = Array.from({ length: 10 }, () => connectRedis());
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.listenerCount("ready")).toBe(2); // logging + readiness
    ready();
    await Promise.all(pending);
    expect(client.listenerCount("ready")).toBe(1);
    expect(client.listenerCount("end")).toBe(0);
  });

  it("waits for automatic reconnection without opening a second socket", async () => {
    const { runRedisCommand, client, ready } = await setup();
    client.isOpen = true;
    const command = vi.fn().mockResolvedValue("PONG");
    const pending = runRedisCommand(command);
    await Promise.resolve();
    expect(command).not.toHaveBeenCalled();
    expect(client.connect).not.toHaveBeenCalled();
    ready();
    await expect(pending).resolves.toBe("PONG");
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("returns 503 on a readiness timeout and recovers on the next call", async () => {
    vi.useFakeTimers();
    const { connectRedis, client, ready } = await setup();
    const pending = connectRedis();
    const check = expect(pending).rejects.toMatchObject({
      status: 503, code: "SERVICE_UNAVAILABLE", expose: true,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
    expect(client.listenerCount("ready")).toBe(1);
    expect(client.listenerCount("end")).toBe(0);
    const recovered = connectRedis();
    ready();
    await recovered;
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("handles an initial connect rejection and allows a new attempt", async () => {
    const { connectRedis, client, ready } = await setup();
    client.connect.mockRejectedValueOnce(new Error("connection refused"));
    await expect(connectRedis()).rejects.toMatchObject({ status: 503 });
    const next = connectRedis();
    ready();
    await next;
    expect(client.connect).toHaveBeenCalledTimes(2);
  });

  it("returns 503 on socket loss without replaying an ambiguous write", async () => {
    const { runRedisCommand, ready } = await setup();
    ready();
    const command = vi.fn().mockRejectedValue(new Error("Socket closed unexpectedly"));
    await expect(runRedisCommand(command)).rejects.toMatchObject({ status: 503 });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("preserves NOSCRIPT replies so RedisStore can reload after a restart", async () => {
    const { runRedisCommand, ready } = await setup();
    const { ErrorReply } = await import("redis");
    ready();
    const error = new ErrorReply("NOSCRIPT No matching script");
    await expect(runRedisCommand(async () => { throw error; })).rejects.toBe(error);
  });

  it("rejects waiters when the client is shut down", async () => {
    const { connectRedis, client } = await setup();
    const pending = connectRedis();
    client.emit("end");
    await expect(pending).rejects.toMatchObject({ status: 503 });
    expect(client.listenerCount("ready")).toBe(1);
  });
});
