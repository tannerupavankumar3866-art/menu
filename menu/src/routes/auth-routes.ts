import { Hono } from "hono"
import { getDB } from "../db/client";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/middleware/require-auth";
import { createToken } from "../lib/utils/user";


const authApi = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>();

authApi.post("/signup", async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) {
            return c.json(
                { error: "Email and password are required" },
                { status: 401 }
            );
        }

        const db = getDB(c.env.DB);

        // check if user exists
        const existingUser = await db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.email, email))
            .get();

        if (existingUser) {
            return c.json({ error: "Email already in use" }, { status: 401 });
        }

        const newUser = {
            email,
            password,
        };

        const [createdUser] = await db.insert(user).values(newUser).returning({ id: user.id, email: user.email });

        if (!createdUser) return c.json({ error: "Failed to create account" }, { status: 401 });

        const token = await createToken(createdUser.email, createdUser.id, c.env.JWT_SECRET);

        return c.json({ success: true, token }, { status: 200 });
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});


// Signin
authApi.post("/signin", async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) {
            return c.json(
                { error: "Email and password are required" },
                { status: 401 }
            );
        }

        const db = getDB(c.env.DB);

        const isUser = await db
            .select({
                id: user.id,
                email: user.email,
                password: user.password
            })
            .from(user)
            .where(eq(user.email, email))
            .get();

        if (!isUser) {
            return c.json({ error: "No account exists for this email" }, { status: 401 });
        }

        if (isUser.password !== password) {
            return c.json({ error: "Incorrect password" }, { status: 401 });
        }

        const token = await createToken(isUser.email, isUser.id, c.env.JWT_SECRET);

        return c.json({ success: true, token }, { status: 200 });
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});


// Reset password

authApi.post("/reset-password", async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) {
            return c.json(
                { error: "Email and password are required" },
                { status: 401 }
            );
        }

        const db = getDB(c.env.DB);

        const isUser = await db
            .select()
            .from(user)
            .where(eq(user.email, email))
            .get();

        if (!isUser) {
            return c.json({ error: "No account exists for this email" }, { status: 401 });
        }
        await db
            .update(user)
            .set({ password })
            .where(eq(user.email, email))

        return c.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});

// user token

authApi.get('/user', requireAuth, async (c) => {
    const authUser = c.get("user");
    const db = getDB(c.env.DB);

    const userData = await db
        .select()
        .from(user)
        .where(eq(user.email, authUser.email))
        .get();

    if (!userData) {
        return c.json({ error: "User not found" }, 404);
    }

    return c.json(
        {
            id: userData.id,
            email: userData.email,
        },
        200
    );
});

export default authApi