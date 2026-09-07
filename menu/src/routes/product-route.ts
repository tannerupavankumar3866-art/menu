import { Hono } from "hono";
import { requireAuth } from "../lib/middleware/require-auth";
import { getDB } from "../db/client";
import { menu, restaurant, variant } from "../db/schema";
import { eq } from "drizzle-orm";

const menuApi = new Hono<{ Bindings: { DB: D1Database; } }>();

menuApi.post('/:slug', requireAuth, async (c) => {
    try {
        const { slug } = await c.req.param();
        const db = getDB(c.env.DB);

        // Check if restaurant exists
        const existingrestaurant = await db
            .select()
            .from(restaurant)
            .where(eq(restaurant.slug, slug));

        if (existingrestaurant.length === 0) {
            return c.json({ error: "restaurant not found" }, 404);
        }

        const restaurantId = existingrestaurant[0].id;

        // Request body
        const { name,
            description,
            price,
            salePrice,
            images,
            categories,
            variants,
            type,
            minOrder,
            isAvailable
        } = await c.req.json();

        // Insert menu
        const insertedmenu = await db
            .insert(menu)
            .values({
                name,
                description,
                price,
                salePrice,
                images,
                categories,
                restaurantId,
                type,
                minOrder,
                isAvailable
            })
            .returning({ id: menu.id }); // get new menu id

        const menuId = insertedmenu[0].id;

        if (type === "variant") {
            const variantValues = variants.map((v: { type: string; value: string; price?: number }) => ({
                type: v.type,
                value: v.value,
                price: v.price ?? 0,
                menuId,
            }));

            await db.insert(variant).values(variantValues);
        }

        return c.json({
            message: "menu created successfully",
            menuId,
        });

    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});

// BULK ADD
menuApi.post('/:slug/bulk', requireAuth, async (c) => {
  try {
    const { slug } = await c.req.param();
    const db = getDB(c.env.DB);

    // Check restaurant exists
    const [existingRestaurant] = await db
      .select()
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (!existingRestaurant) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingRestaurant.id;

    // Parse request body
    const body = await c.req.json();
    if (!Array.isArray(body)) {
      return c.json({ error: "Request body must be an array" }, 400);
    }

    const insertedMenus: any[] = [];

    for (const p of body) {
      // Insert Menu
      const [menuResult] = await db.insert(menu).values({
        name: p.name,
        price: p.price,
        description: p.description ?? "",
        images: p.images ?? [],
        categories: p.categories ?? [],
        salePrice: p.salePrice ?? 0,
        minOrder: p.minOrder ?? 1,
        type: p.type ?? "simple",
        isAvailable: p.isAvailable ?? true,
        restaurantId,
      }).returning();

      insertedMenus.push(menuResult);

      // Insert Variants if product type = "variant"
      if (p.type === "variant" && Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          await db.insert(variant).values({
            type: v.type ?? "Default",
            value: v.value,
            price: v.price ?? 0,
            menuId: menuResult.id,
          });
        }
      }
    }

    return c.json({
      message: "menus created successfully with variants",
      count: insertedMenus.length,
      menus: insertedMenus,
    });

  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});




// BULK UPDATE
menuApi.put('/:slug/bulk', requireAuth, async (c) => {
  try {
    const { slug } = await c.req.param();
    const db = getDB(c.env.DB);

    // ✅ Check restaurant exists
    const existingrestaurant = await db
      .select()
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingrestaurant.length === 0) {
      return c.json({ error: "restaurant not found" }, 404);
    }

    const restaurantId = existingrestaurant[0].id;

    // ✅ Parse request body
    const body = await c.req.json();
    if (!Array.isArray(body)) {
      return c.json({ error: "Request body must be an array of menus" }, 400);
    }

    const updatedmenus = [];
    for (const p of body) {
      if (!p.id) continue; // must have id for editing

      const updated = await db
        .update(menu)
        .set({
          name: p.name,
          price: p.price,
          images: p.images ?? [],
          categories: p.categories ?? [],
          description: p.description ?? "",
          salePrice: p.salePrice ?? 0,
          minOrder: p.minOrder ?? 1,
          type: p.type ?? "simple",
          isAvailable: p.isAvailable ?? true,
        })
        .where(eq(menu.id, p.id))
        .returning();

      if (updated.length > 0) updatedmenus.push(updated[0]);
    }

    return c.json({
      message: "menus updated successfully",
      count: updatedmenus.length,
      menus: updatedmenus,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});




menuApi.get('/:slug', requireAuth, async (c) => {
    try {
        const { slug } = c.req.param();
        const db = getDB(c.env.DB);

        // Check if restaurant exists
        const existingrestaurant = await db
            .select()
            .from(restaurant)
            .where(eq(restaurant.slug, slug));

        if (existingrestaurant.length === 0) {
            return c.json({ error: "restaurant not found" }, 404);
        }

        const restaurantId = existingrestaurant[0].id;

        const menus = await db
            .select()
            .from(menu)
            .where(eq(menu.restaurantId, restaurantId));

        return c.json({ menus }, 201)
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});

menuApi.get('/menuId/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const db = getDB(c.env.DB);

        // Check if menu exists
        const existingmenu = await db
            .select()
            .from(menu)
            .where(eq(menu.id, Number(id)));

        if (existingmenu.length === 0) {
            return c.json({ error: "menu not found" }, 404);
        }

        const menus = existingmenu[0];

        // Get variants for this menu
        const variants = await db
            .select()
            .from(variant)
            .where(eq(variant.menuId, menus.id));

        return c.json({
            ...menus,
            variants: variants ?? []
        }, 201);

    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});


// PUT /api/menu/menuId/:id
menuApi.put('/menuId/:id', requireAuth, async (c) => {
    try {
        const { id } = c.req.param();
        const db = getDB(c.env.DB);

        // Check if menu exists
        const existingmenu = await db
            .select()
            .from(menu)
            .where(eq(menu.id, Number(id)));

        if (!existingmenu.length) {
            return c.json({ error: "menu not found" }, 404);
        }

        // Request body
        const { name,
            description,
            price,
            salePrice,
            images,
            categories,
            variants,
            type,
            minOrder,
        isAvailable } = await c.req.json();

        // Update menu
        await db
            .update(menu)
            .set({
                name,
                description,
                price,
                salePrice,
                images,
                categories,
                type,
                minOrder,
                isAvailable
            })
            .where(eq(menu.id, Number(id)));

        // Handle variants only if menu type is "variant"
        if (type === "variant" && Array.isArray(variants)) {
            // Delete old variants
            await db.delete(variant).where(eq(variant.menuId, Number(id)));

            // Insert new variants
            await db.insert(variant).values(
                variants.map((v: { type: string; value: string; price?: number }) => ({
                    type: v.type,
                    value: v.value,
                    price: v.price ?? 0,
                    menuId: Number(id),
                }))
            );
        }

        return c.json({
            message: "menu updated successfully",
            menuId: Number(id),
        });

    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});


// DELETE /api/menu/menuId/:id
menuApi.delete('/menuId/:id', requireAuth, async (c) => {
    try {
        const { id } = await c.req.param();
        const db = getDB(c.env.DB);

        // Check if menu exists
        const existingmenu = await db
            .select()
            .from(menu)
            .where(eq(menu.id, Number(id)));

        if (existingmenu.length === 0) {
            return c.json({ error: "menu not found" }, 404);
        }

        // Delete variants first
        await db.delete(variant).where(eq(variant.menuId, Number(id)));

        // Delete menu
        await db.delete(menu).where(eq(menu.id, Number(id)));

        return c.json({
            message: "menu and its variants deleted successfully",
            menuId: Number(id),
        });

    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, { status: 500 });
    }
});

export default menuApi