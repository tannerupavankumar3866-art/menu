import { Hono } from "hono"
import { requireAuth } from "../lib/middleware/require-auth"
import { getDB } from "../db/client";
import { category, restaurant } from "../db/schema";
import { eq } from "drizzle-orm";

const categoryApi = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string; } }>()

categoryApi.get('/:slug', requireAuth, async (c) => {
    try {
        const { slug } = c.req.param();
        const db = getDB(c.env.DB);

        // 1. Validate restaurant
        const existingrestaurant = await db
            .select({
                id:restaurant.id,
                slug:restaurant.slug
            })
            .from(restaurant)
            .where(eq(restaurant.slug, slug));

        if (existingrestaurant.length === 0) {
            return c.json({ error: "restaurant not found" }, 404);
        }

        const restaurantId = existingrestaurant[0].id;

        const categories = await db
        .select()
        .from(category)
        .where(eq(category.restaurantId, restaurantId));

        return c.json({categories})
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, 500);
    }
});


categoryApi.post('/:slug', requireAuth, async (c) => {
    try {
        const { slug } = c.req.param();
        const db = getDB(c.env.DB);

        // 1. Validate restaurant
        const existingrestaurant = await db
            .select({
                id:restaurant.id,
                slug:restaurant.slug
            })
            .from(restaurant)
            .where(eq(restaurant.slug, slug));

        if (existingrestaurant.length === 0) {
            return c.json({ error: "restaurant not found" }, 404);
        }

        const restaurantId = existingrestaurant[0].id;
        const {name} = await c.req.json();

        const result = await db
        .insert(category)
        .values({
            name,
            restaurantId
        })
        .run();

        if(result.meta.changes === 0) return c.json({error:"Failed to add category"}, 401);

        return c.json({success:true},201);

    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, 500);
    }
})



// Update single category (name and image)
categoryApi.put('/:id', requireAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const { name, imageUrl } = await c.req.json();
    const db = getDB(c.env.DB);

    await db
      .update(category)
      .set({
        name: name,
        imageUrl: imageUrl,
      })
      .where(eq(category.id, parseInt(id)));

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Bulk update category order
categoryApi.put('/:slug/reorder', requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const { categories: updatedCategories } = await c.req.json();
    const db = getDB(c.env.DB);

    const existingRestaurant = await db
      .select({ id: restaurant.id })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingRestaurant.length === 0) {
      return c.json({ error: "Restaurant not found" }, 404);
    }

    // Bulk update order for each category
    for (const cat of updatedCategories) {
      await db
        .update(category)
        .set({ order: cat.order })
        .where(eq(category.id, cat.id));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete category
categoryApi.delete('/:id', requireAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDB(c.env.DB);

    await db
      .delete(category)
      .where(eq(category.id, parseInt(id)));

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


// PUT update all categories (bulk save)
categoryApi.put('/all/:slug', requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const body = await c.req.json();
    const db = getDB(c.env.DB);

    const existingrestaurant = await db
      .select({
        id:restaurant.id
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingrestaurant.length === 0) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingrestaurant[0].id;

    // Bulk update (loop categories)
    for (const cat of body.categories) {
      await db
        .update(category)
        .set({
          name: cat.name,
          order: cat.order,
          imageUrl: cat.imageUrl,
        })
        .where(eq(category.id, cat.id));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE category
categoryApi.delete('/:id', requireAuth, async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDB(c.env.DB);

    await db.delete(category).where(eq(category.id, Number(id)));

    return c.json({ success: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
export default categoryApi