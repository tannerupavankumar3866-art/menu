import { Hono } from "hono";
import { requireAuth } from "../lib/middleware/require-auth";
import { getDB } from "../db/client";
import { category, menu, plans, platformData, restaurant, user } from '../db/schema'
import { eq, and } from "drizzle-orm";
import { createRazorpayOrder, generateHmacSHA256 } from "../lib/utils/razorpay";

const restaurantApi = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string; CF_PROJECT_NAME: string; CF_ACCOUNT_ID: string; CF_API_TOKEN: string; UPLOADTHING_SECRET: string; VERCEL_TOKEN: string; } }>();

restaurantApi.get('/get-all', requireAuth, async (c) => {
  try {
    const authUser = c.get("user");
    const db = getDB(c.env.DB);
    const userData = await db
      .select({
        id: user.id
      })
      .from(user)
      .where(eq(user.email, authUser.email))
      .get();

    if (!userData) return c.json({ error: "Unauthorized" });

    const restaurants = await db.select({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug
    })
      .from(restaurant)
      .where(eq(restaurant.owner, userData.id));

    return c.json({ restaurants }, 201)

  } catch (error) {
    console.error(error);
    c.json({ error: "Internal server error" }, { status: 500 });
  }
});


restaurantApi.post('/create-one', requireAuth, async (c) => {
  try {
    const authUser = c.get("user");
    const db = getDB(c.env.DB);

    const userData = await db
      .select({
        id: user.id
      })
      .from(user)
      .where(eq(user.email, authUser.email))
      .get();

    if (!userData) return c.json({ error: "Unauthorized" });

    const { name, slug: requestedSlug, settings } = await c.req.json();

    // Function to generate a unique slug
    const generateUniqueSlug = async (baseSlug: string): Promise<string> => {
      let finalSlug = baseSlug;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loops

      while (!isUnique && attempts < maxAttempts) {
        // Check if slug exists
        const existingRestaurant = await db
          .select({
            slug: restaurant.slug
          })
          .from(restaurant)
          .where(eq(restaurant.slug, finalSlug))
          .get();

        if (!existingRestaurant) {
          isUnique = true;
        } else {
          // Generate random 2-digit number (10-99)
          const randomNum = Math.floor(Math.random() * 90) + 10;
          finalSlug = `${baseSlug}-${randomNum}`;
          attempts++;
        }
      }

      // If we couldn't find a unique slug after max attempts, add timestamp
      if (!isUnique) {
        finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      }

      return finalSlug;
    };

    // Generate unique slug
    const slug = await generateUniqueSlug(requestedSlug);

    // Create a membership for this restaurant (expiry = now + 3 days)
    const expiryDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 3 days in ms

    // 1️⃣ Create the restaurant
    const newrestaurant = await db
      .insert(restaurant)
      .values({
        name: name,
        slug: slug,
        owner: userData.id,
        membershipType: "trial",
        expiryDate: expiryDate,
        settings: settings
      })
      .returning({ id: restaurant.id, slug: restaurant.slug }) // Also return the generated slug
      .get();

    return c.json({
      restaurant: newrestaurant,
      message: "Restaurant created successfully with auto-generated slug"
    }, 201);

  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


restaurantApi.get('/check-slug/:slug', async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // Fetch restaurant by slug
    const existingrestaurant = await db
      .select({
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        owner: restaurant.owner,
        domain: restaurant.domain,
        logo: restaurant.logo,
        description: restaurant.description,
        favicon: restaurant.favicon,
        whatsAppNumber: restaurant.whatsAppNumber,
        membershipType: restaurant.membershipType,
        expiryDate: restaurant.expiryDate,
        settings: restaurant.settings,

      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingrestaurant.length === 0) {
      return c.json({ exists: false }, 200);
    }

    const restaurantData = existingrestaurant[0];


    // Build response matching restaurantType
    const response = {
      id: restaurantData.id,
      name: restaurantData.name,
      slug: restaurantData.slug,
      owner: restaurantData.owner ?? undefined,
      domain: restaurantData.domain ?? undefined,
      logo: restaurantData.logo ?? undefined,
      description: restaurantData.description ?? undefined,
      favicon: restaurantData.favicon ?? undefined,
      whatsAppNumber: restaurantData.whatsAppNumber ?? undefined,
      membershipType: restaurantData.membershipType ?? undefined,
      expiryDate: restaurantData.expiryDate ?? undefined,
      settings: restaurantData.settings ?? undefined,
    };

    return c.json({ exists: true, restaurant: response }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});



restaurantApi.get('/public-data/:slug', async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // Find restaurant by slug
    const existingrestaurant = await db
      .select({
        slug: restaurant.slug,
        id: restaurant.id,
        name: restaurant.name,
        description: restaurant.description,
        settings: restaurant.settings,
        membershipType: restaurant.membershipType,
        expiryDate: restaurant.expiryDate
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingrestaurant.length === 0) {
      return c.json(
        { error: "restaurant not found", restaurant: false },
        404
      );
    }

    const currentrestaurant = existingrestaurant[0];

    return c.json(
      {
        success: true,
        restaurant: currentrestaurant,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    return c.json(
      { error: "Internal Server Error" },
      500
    );
  }
});


restaurantApi.get('/public-data-menu-cat/:slug', async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // Find restaurant by slug
    const existingrestaurant = await db
      .select({
        slug: restaurant.slug,
        id: restaurant.id,
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingrestaurant.length === 0) {
      return c.json(
        {
          error: "restaurant not found",
          menus: [],
          categories: []
        },
        404
      );
    }

    const currentrestaurant = existingrestaurant[0];

    // Fetch menus for this restaurant
    const menus = await db
      .select({
        id: menu.id,
        name: menu.name,
        description: menu.description,
        price: menu.price,
        salePrice: menu.salePrice,
        images: menu.images,
        type: menu.type,
        minOrder: menu.minOrder,
        categories: menu.categories,
      })
      .from(menu)
      .where(and( eq(menu.restaurantId, currentrestaurant.id), eq(menu.isAvailable, true) ));

    // Collect menu IDs

    // Fetch categories for this restaurant
    const categories = await db
      .select({
        id: category.id,
        name: category.name,
        order: category.order,
        imageUrl: category.imageUrl
      })
      .from(category)
      .where(eq(category.restaurantId, currentrestaurant.id));

    return c.json(
      {
        success: true,
        menus: menus,
        categories,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    return c.json(
      { error: "Internal Server Error" },
      500
    );
  }
});



restaurantApi.get('/get-restaurant-data/:slug', requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // Check if store exists
    const existingStore = await db
      .select()
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingStore.length === 0) {
      return c.json({ error: "Store not found" }, 404);
    }

    // Return store details only
    return c.json(existingStore[0]);

  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /api/store/update-any/:slug
restaurantApi.put('/update-any/:slug', requireAuth, async (c) => {
  try {
    const { slug } = c.req.param();
    const db = getDB(c.env.DB);

    // Check if store exists
    const existingStore = await db
      .select({
        slug: restaurant.slug
      })
      .from(restaurant)
      .where(eq(restaurant.slug, slug));

    if (existingStore.length === 0) {
      return c.json({ error: "Store not found" }, 404);
    }

    // Request body contains fields to update
    const storeData = await c.req.json();

    // Update store (only fields provided in storeData)
    await db
      .update(restaurant)
      .set(storeData)
      .where(eq(restaurant.slug, slug));

    return c.json({
      message: "Store updated successfully",
      slug
    });

  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});




restaurantApi.post("/order/create-one", async (c) => {
  try {
    const db = getDB(c.env.DB);
    const {
      planId
    } = await c.req.json();

    const platform = await db.select().from(platformData).get();
    const selectedPlan = await db.select().from(plans).where(eq(plans.id, planId)).get();

    if (!selectedPlan) {
      return c.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const finalAmount = selectedPlan.price;


    // 🟢 Razorpay enabled?
    if (platform?.paymentType === "razorpay" && platform.razorpayKeyId && platform.razorpayKeySecret) {
      const razorPayOrder = await createRazorpayOrder({
        keyId: platform.razorpayKeyId,
        keySecret: platform.razorpayKeySecret,
        amount: finalAmount * 100,
        receipt: `${finalAmount}-${Date.now()}`,
      });

      return c.json({
        success: true,
        razorpay: {
          keyId: platform.razorpayKeyId,
          razorPayOrderId: razorPayOrder.id,
          amount: razorPayOrder.amount,
          currency: razorPayOrder.currency,
        },
      });
    }


  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
});



restaurantApi.post("/order/verify", async (c) => {
  try {
    const db = getDB(c.env.DB);
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      userId,
      restaurantId,
    } = await c.req.json();

    const platform = await db.select().from(platformData).get();

    const expected = await generateHmacSHA256(
      platform?.razorpayKeySecret ?? "",
      razorpay_order_id + "|" + razorpay_payment_id
    );

    if (expected !== razorpay_signature) {
      return c.json({ success: false, error: "Invalid signature" }, { status: 400 });
    }

    // ✅ Valid payment → activate or update membership
    const plan = await db.select().from(plans).where(eq(plans.id, planId)).get();
    if (!plan) {
      return c.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const now = Date.now();
    let expiry: number | null = null;

    if (plan.type === "monthly") expiry = now + 30 * 24 * 60 * 60 * 1000;
    else if (plan.type === "yearly") expiry = now + 365 * 24 * 60 * 60 * 1000;
    else if (plan.type === "lifetime") expiry = now + 365 * 24 * 60 * 60 * 1000;

    const existingRestaurant = await db
      .select({
        id: restaurant.id,
      })
      .from(restaurant)
      .where(eq(restaurant.id, restaurantId))
      .get();

    if (!existingRestaurant) {
      return c.json({ success: false, error: "Restaurant not found" }, { status: 404 });


    } else {
      await db
        .update(restaurant)
        .set({
          membershipType: plan.type === "lifetime" ? "lifetime" : "basic",
          expiryDate: expiry,
        })
        .where(eq(restaurant.id, restaurantId))

    }

    return c.json({ success: true, message: "Membership activated or updated" });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, error: "Failed to verify payment" }, { status: 500 });
  }
});


export default restaurantApi