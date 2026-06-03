import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import * as authUtils from "./auth-utils";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    /**
     * Register a new local user with username and password
     */
    register: publicProcedure
      .input(
        z.object({
          username: z.string().min(3).max(32),
          password: z.string().min(6),
          name: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Validate username format
        if (!authUtils.validateUsername(input.username)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Username must be 3-32 characters, alphanumeric and underscore only",
          });
        }

        // Validate password strength
        if (!authUtils.validatePassword(input.password)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password must be at least 6 characters",
          });
        }

        // Check if username already exists
        const existingUser = await db.getUserByUsername(input.username);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Username already exists",
          });
        }

        try {
          // Hash password
          const passwordHash = authUtils.hashPassword(input.password);

          // Create user
          await db.createLocalUser(input.username, passwordHash, input.name);

          // Get the created user
          const user = await db.getUserByUsername(input.username);
          if (!user) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create user",
            });
          }

          // Create session token
          const sessionToken = await db.createSessionToken(user.id, input.username);

          // Set session cookie
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

          // Update last signed in
          await db.updateLastSignedIn(user.id);

          return {
            success: true,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          };
        } catch (error) {
          console.error("[Auth] Registration error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Registration failed",
          });
        }
      }),

    /**
     * Login with username and password
     */
    login: publicProcedure
      .input(
        z.object({
          username: z.string(),
          password: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // Get user by username
          const user = await db.getUserByUsername(input.username);
          if (!user || !user.passwordHash) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid username or password",
            });
          }

          // Verify password
          const isPasswordValid = authUtils.verifyPassword(input.password, user.passwordHash);
          if (!isPasswordValid) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid username or password",
            });
          }

          // Create session token
          const sessionToken = await db.createSessionToken(user.id, user.username || '');

          // Set session cookie
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

          // Update last signed in
          await db.updateLastSignedIn(user.id);

          return {
            success: true,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.error("[Auth] Login error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Login failed",
          });
        }
      }),

    /**
     * Verify current session
     */
    verify: protectedProcedure.query(({ ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      return {
        success: true,
        user: {
          id: ctx.user.id,
          username: ctx.user.username,
          name: ctx.user.name,
          email: ctx.user.email,
          role: ctx.user.role,
        },
      };
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
