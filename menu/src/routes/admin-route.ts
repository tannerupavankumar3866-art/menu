import { Hono } from 'hono'
import { eq, desc, count, gt, lt, and, inArray } from 'drizzle-orm'
import { getDB } from '../db/client';
import { restaurant, user, platformData, plans, variant, menu, addons, category } from '../db/schema';
const adminMenusApi = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>();

// GET /api/admin/all-cards - Get all restaurants (formerly cards) with user data
adminMenusApi.get('/all-restaurants', async (c) => {
    try {
        const db = getDB(c.env.DB)

        // Select restaurant data and user data (membership is now part of restaurant)
        const restaurantWithData = await db
            .select({
                id: restaurant.id,
                owner: restaurant.owner,
                slug: restaurant.slug,
                name: restaurant.name,
                membershipType: restaurant.membershipType,
                expiryDate: restaurant.expiryDate,
                createdAt: restaurant.createdAt,
                user: {
                    id: user.id,
                    email: user.email,
                },
            })
            .from(restaurant)
            .leftJoin(user, eq(restaurant.owner, user.id))
            .orderBy(desc(restaurant.createdAt))

        // Re-map the data structure to match the old 'cardsWithData' output keys as closely as possible
        const restaurantsWithData = restaurantWithData.map(r => ({
            id: r.id,
            owner: r.user?.email ?? "",
            slug: r.slug,
            name: r.name,
            createdAt: r.createdAt,
            membershipType: r.membershipType,
            expiryDate: r.expiryDate,
        }));

        return c.json(restaurantsWithData, 200)
    } catch (error) {
        console.error('Error fetching cards:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// PUT /api/admin/cards/:cardId/membership - Update membership for a card (now restaurant)
adminMenusApi.put('/restaurants/:restaurantId/membership', async (c) => {
    try {
        const restaurantId = parseInt(c.req.param('restaurantId'))
        const { membershipType, expiryDate } = await c.req.json()

        const db = getDB(c.env.DB)

        // Check if restaurant exists
        const existingRestaurant = await db
            .select({ id: restaurant.id })
            .from(restaurant)
            .where(eq(restaurant.id, restaurantId))
            .limit(1)

        if (existingRestaurant.length === 0) {
            return c.json({ error: 'Restaurant not found' }, 404)
        }

        // Update the restaurant's membership fields directly
        await db
            .update(restaurant)
            .set({
                membershipType: membershipType,
                expiryDate: expiryDate,
            })
            .where(eq(restaurant.id, restaurantId))

        return c.json({ success: true, message: 'Membership updated successfully' }, 200)
    } catch (error) {
        console.error('Error updating membership:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})
// --- Platform Data & Plans APIs (Unchanged in Logic, only variable names/imports) ---
adminMenusApi.get('/platform-data', async (c) => {
    try {
        const db = getDB(c.env.DB)

        const data = await db
            .select()
            .from(platformData)
            .limit(1)

        // If no data exists, return default structure
        if (data.length === 0) {
            const defaultData = {
                id: 0,
                paymentType: "whatsapp" as const,
                whatsapp: "",
                adminEmail: "",
                razorpayKeyId: "",
                razorpayKeySecret: "",
            }
            return c.json(defaultData, 200)
        }

        return c.json(data[0], 200)
    } catch (error) {
        console.error('Error fetching platform data:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// PUT /api/admin/platform-data - Update platform data
adminMenusApi.put('/platform-data', async (c) => {
    try {
        const updateData = await c.req.json()

        const db = getDB(c.env.DB)

        // Check if data exists
        const existingData = await db
            .select()
            .from(platformData)
            .limit(1)

        let result;

        if (existingData.length > 0) {
            // Update existing data
            result = await db
                .update(platformData)
                .set({
                    paymentType: updateData.paymentType,
                    whatsapp: updateData.whatsapp,
                    adminEmail: updateData.adminEmail,
                    razorpayKeyId: updateData.razorpayKeyId,
                    razorpayKeySecret: updateData.razorpayKeySecret,
                })
                .where(eq(platformData.id, existingData[0].id))
        } else {
            // Insert new data
            result = await db.insert(platformData).values({
                paymentType: updateData.paymentType,
                whatsapp: updateData.whatsapp,
                adminEmail: updateData.adminEmail,
                razorpayKeyId: updateData.razorpayKeyId,
                razorpayKeySecret: updateData.razorpayKeySecret,
            })
        }

        return c.json({ success: true, message: 'Platform data updated successfully' }, 200)
    } catch (error) {
        console.error('Error updating platform data:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// Delete Restaurant
adminMenusApi.delete('/restaurants/:id', async (c) => {
  try {
    const restaurantId = parseInt(c.req.param('id'));
    const db = getDB(c.env.DB);

    // 1. Get menu IDs first (this must be a separate query)
    const restaurantMenus = await db
      .select({ id: menu.id })
      .from(menu)
      .where(eq(menu.restaurantId, restaurantId))
      .all();
    
    const menuIds = restaurantMenus.map(m => m.id);

    // 2. Build a list of statements for the batch
    const statements = [];

    if (menuIds.length > 0) {
      statements.push(db.delete(variant).where(inArray(variant.menuId, menuIds)));
      statements.push(db.delete(addons).where(inArray(addons.menuId, menuIds)));
    }

    statements.push(db.delete(menu).where(eq(menu.restaurantId, restaurantId)));
    statements.push(db.delete(category).where(eq(category.restaurantId, restaurantId)));
    statements.push(db.delete(restaurant).where(eq(restaurant.id, restaurantId)));

    // 3. Execute all at once
    await db.batch(statements as any);

    return c.json({ success: true, message: "Restaurant deleted" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Clone menu
adminMenusApi.post('/restaurants/:id/clone', async (c) => {
  try {
    const restaurantId = parseInt(c.req.param('id'));
    const db = getDB(c.env.DB);

    const original = await db.select().from(restaurant).where(eq(restaurant.id, restaurantId)).get();
    if (!original) return c.json({ error: "Restaurant not found" }, 404);

    const randomDigits = Math.floor(Math.random() * 90) + 10;
    const newSlug = `${original.slug}-${randomDigits}`;

    // 1. Clone Restaurant
    const newRes = await db.insert(restaurant).values({
      ...original,
      id: undefined,
      slug: newSlug,
      name: `${original.name} (Clone)`,
      createdAt: Date.now(),
    }).returning({ id: restaurant.id }).get();

    // 2. Clone Categories
    const originalCategories = await db.select().from(category).where(eq(category.restaurantId, restaurantId)).all();
    if (originalCategories.length > 0) {
      const catInserts = originalCategories.map(cat => 
        db.insert(category).values({ ...cat, id: undefined, restaurantId: newRes.id })
      );
      await db.batch(catInserts as any);
    }

    // 3. Clone Menus, Variants, and Addons
    const originalMenus = await db.select().from(menu).where(eq(menu.restaurantId, restaurantId)).all();
    
    for (const m of originalMenus) {
      const oldMenuId = m.id;
      const newMenu = await db.insert(menu).values({
        ...m,
        id: undefined,
        restaurantId: newRes.id,
        createdAt: Date.now()
      }).returning({ id: menu.id }).get();

      // Collect variants and addons for this specific menu
      const menuChildStatements: any[] = [];
      
      const originalVariants = await db.select().from(variant).where(eq(variant.menuId, oldMenuId)).all();
      originalVariants.forEach(v => {
        menuChildStatements.push(db.insert(variant).values({ ...v, id: undefined, menuId: newMenu.id }));
      });

      const originalAddons = await db.select().from(addons).where(eq(addons.menuId, oldMenuId)).all();
      originalAddons.forEach(a => {
        menuChildStatements.push(db.insert(addons).values({ ...a, id: undefined, menuId: newMenu.id }));
      });

      if (menuChildStatements.length > 0) {
        await db.batch(menuChildStatements as any);
      }
    }

    return c.json({ success: true, restaurant: newRes });
  } catch (error) {
    console.error("Cloning failed:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/admin/plans - Get all plans
adminMenusApi.get('/plans', async (c) => {
    try {
        const db = getDB(c.env.DB)

        const allPlans = await db
            .select()
            .from(plans)
            .orderBy(desc(plans.createdAt))

        // Parse features from JSON string to array
        const plansWithParsedFeatures = allPlans.map(plan => ({
            ...plan,
            features: plan.features ? JSON.parse(plan.features) : []
        }))

        return c.json(plansWithParsedFeatures, 200)
    } catch (error) {
        console.error('Error fetching plans:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// POST /api/admin/plans - Create new plan
adminMenusApi.post('/plans', async (c) => {
    try {
        const { name, description, price, originalPrice, type, features, cta, popular } = await c.req.json()

        if (!name || !description || price === undefined) {
            return c.json({ error: 'Missing required fields' }, 400)
        }

        const db = getDB(c.env.DB)

        const result = await db.insert(plans).values({
            name,
            description,
            price,
            originalPrice: originalPrice || price,
            type: type || 'monthly',
            features: JSON.stringify(features || []),
            cta: cta || 'Get Plan',
            popular: popular || false,
        })

        return c.json({ success: true, message: 'Plan created successfully' }, 201)
    } catch (error) {
        console.error('Error creating plan:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// PUT /api/admin/plans/:id - Update plan
adminMenusApi.put('/plans/:id', async (c) => {
    try {
        const planId = parseInt(c.req.param('id'))
        const { name, description, price, originalPrice, type, features, cta, popular } = await c.req.json()

        if (!planId) {
            return c.json({ error: 'Plan ID is required' }, 400)
        }

        const db = getDB(c.env.DB)

        // Check if plan exists
        const existingPlan = await db
            .select()
            .from(plans)
            .where(eq(plans.id, planId))
            .limit(1)

        if (existingPlan.length === 0) {
            return c.json({ error: 'Plan not found' }, 404)
        }

        await db
            .update(plans)
            .set({
                name,
                description,
                price,
                originalPrice: originalPrice || price,
                type: type || 'monthly',
                features: JSON.stringify(features || []),
                cta: cta || 'Get Plan',
                popular: popular || false,
            })
            .where(eq(plans.id, planId))

        return c.json({ success: true, message: 'Plan updated successfully' }, 200)
    } catch (error) {
        console.error('Error updating plan:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// DELETE /api/admin/plans/:id - Delete plan
adminMenusApi.delete('/plans/:id', async (c) => {
    try {
        const planId = parseInt(c.req.param('id'))

        if (!planId) {
            return c.json({ error: 'Plan ID is required' }, 400)
        }

        const db = getDB(c.env.DB)

        // Check if plan exists
        const existingPlan = await db
            .select()
            .from(plans)
            .where(eq(plans.id, planId))
            .limit(1)

        if (existingPlan.length === 0) {
            return c.json({ error: 'Plan not found' }, 404)
        }

        await db
            .delete(plans)
            .where(eq(plans.id, planId))

        return c.json({ success: true, message: 'Plan deleted successfully' }, 200)
    } catch (error) {
        console.error('Error deleting plan:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

// --- Stats API (Updated to use restaurant schema for card/membership data) ---
adminMenusApi.get('/stats', async (c) => {
    try {
        const db = getDB(c.env.DB)
        const currentTime = Date.now()

        // Get total users count
        const totalUsersResult = await db
            .select({ count: count() })
            .from(user)

        const totalUsers = totalUsersResult[0]?.count || 0

        // Get total cards/restaurants count
        const totalCardsResult = await db
            .select({ count: count() })
            .from(restaurant) // Use restaurant table for cards count

        const totalCards = totalCardsResult[0]?.count || 0

        // Get active memberships (not expired)
        const activeMembershipsResult = await db
            .select({ count: count() })
            .from(restaurant) // Use restaurant table for memberships
            .where(gt(restaurant.expiryDate, currentTime)) // Use restaurant.expiryDate

        const activeMemberships = activeMembershipsResult[0]?.count || 0

        // Get expired memberships
        const expiredMembershipsResult = await db
            .select({ count: count() })
            .from(restaurant) // Use restaurant table for memberships
            .where(lt(restaurant.expiryDate, currentTime)) // Use restaurant.expiryDate

        const expiredMemberships = expiredMembershipsResult[0]?.count || 0

        // Get recent activity (last 7 days)
        const sevenDaysAgo = currentTime - (7 * 24 * 60 * 60 * 1000)

        // New users in last 7 days
        const newUsersResult = await db
            .select({ count: count() })
            .from(user)
            .where(gt(user.createdAt, sevenDaysAgo))

        const newUsers = newUsersResult[0]?.count || 0

        // New cards/restaurants in last 7 days
        const newCardsResult = await db
            .select({ count: count() })
            .from(restaurant) // Use restaurant table
            .where(gt(restaurant.createdAt, sevenDaysAgo)) // Use restaurant.createdAt

        const newCards = newCardsResult[0]?.count || 0

        // Memberships expiring in next 7 days
        const nextWeek = currentTime + (7 * 24 * 60 * 60 * 1000)
        const expiringSoonResult = await db
            .select({ count: count() })
            .from(restaurant) // Use restaurant table
            .where(
                and(
                    gt(restaurant.expiryDate, currentTime),
                    lt(restaurant.expiryDate, nextWeek)
                )
            )

        const expiringSoon = expiringSoonResult[0]?.count || 0

        const stats = {
            totalUsers,
            totalCards,
            activeMemberships,
            expiredMemberships,
            recentActivity: {
                newUsers,
                newCards,
                expiringSoon,
            },
        }

        return c.json(stats, 200)
    } catch (error) {
        console.error('Error fetching dashboard stats:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})
export default adminMenusApi