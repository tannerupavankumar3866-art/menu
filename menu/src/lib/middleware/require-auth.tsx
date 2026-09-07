import { Context, Next } from "hono";
import { jwtVerify } from "jose";


type UserPayload = {
    email: string;
    id: number;
};

export async function requireAuth(
    c: Context<{ Variables: { user: UserPayload }; Bindings: { JWT_SECRET: string } }>,
    next: Next
) {
    const authHeader = c.req.header("authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    try {
        const token = authHeader.split(" ")[1];
        const { payload } = await jwtVerify(token, secret);

        c.set("user", payload as UserPayload);
        await next();
    } catch (err) {
        console.error("JWT error:", err);
        return c.json({ error: "Invalid token" }, 401);
    }
}