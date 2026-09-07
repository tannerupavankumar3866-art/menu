import { Hono } from "hono";
import { getDB } from "../db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/middleware/require-auth";
import { restaurant } from "../db/schema";
import { getUtapi } from "../lib/utils/upload-thing";

const imagesApi = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string; UPLOADTHING_TOKEN: string; } }>();


imagesApi.post("/:slug", requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // 1. Validate restaurant
    const existingRestaurant = await db
      .select({
        id: restaurant.id,
        slug: restaurant.slug
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingRestaurant.length === 0) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingRestaurant[0].id;

    // 2. Get file from request
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Generate unique name
    const uniqueName = `file-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}${file.name.substring(file.name.lastIndexOf("."))}`; // keep extension

    // Re-wrap File with new name
    const renamedFile = new File([file], uniqueName, { type: file.type });

    // 3. Upload to uploadthing
    const utapi = getUtapi(c.env);
    const uploadRes = await utapi.uploadFiles(renamedFile);
    console.log("uploadRes", uploadRes)
    if (!uploadRes || !uploadRes.data?.url) {
      return c.json({ error: "Failed to upload file" }, 500);
    }

    const url = uploadRes.data.url;

    // 5. Return response
    return c.json(
      {
        success: true,
      },
      201
    );
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


imagesApi.delete("/:slug", requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // 1. Validate restaurant
    const existingRestaurant = await db
      .select({
        id: restaurant.id,
        slug: restaurant.slug
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingRestaurant.length === 0) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingRestaurant[0].id;

    // 2. Get url from body
    const body = await c.req.json<{ url: string }>();
    const { url } = body;

    if (!url) {
      return c.json({ error: "No URL provided" }, 400);
    }

    // 3. Delete from UploadThing
    const utapi = getUtapi(c.env);

    const parts = url.split("/");
    const fileKey = parts[parts.length - 1];

    await utapi.deleteFiles(fileKey);

  
    return c.json({ success: true });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


imagesApi.get("/:slug", requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // 1. Validate restaurant
    const existingRestaurant = await db
      .select({
        id: restaurant.id,
        slug: restaurant.slug
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingRestaurant.length === 0) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingRestaurant[0].id;

   

    return c.json({  }, 200);
  } catch (error) {
    console.error("GET images ERROR:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default imagesApi