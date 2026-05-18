import { GraphQLClient } from "graphql-request";

const ENDPOINT = "https://graphql.anilist.co";

// Simple token-bucket limiter: AniList allows ~90 requests/minute.
class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private last = Date.now();

  constructor(capacity: number, perMinute: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = perMinute / 60_000;
  }

  async take(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

const limiter = new RateLimiter(90, 90);
const gql = new GraphQLClient(ENDPOINT);

export async function anilistRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  await limiter.take();
  return gql.request<T>(query, variables);
}
