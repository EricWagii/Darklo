import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function authenticateLocalUser(cookieValue: string | undefined | null): Promise<User | null> {
  if (!cookieValue) {
    return null;
  }

  try {
    const secretKey = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });

    // Check if this is a local user JWT (has userId, not openId)
    if (payload.userId && typeof payload.userId === "number") {
      const user = await db.getUserById(payload.userId);
      return user || null;
    }

    return null;
  } catch (error) {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const cookies = parseCookies(opts.req.headers.cookie);
  const sessionCookie = cookies.get("app_session_id");

  // Try local user authentication first
  user = await authenticateLocalUser(sessionCookie);

  // If local auth fails, try OAuth authentication
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
