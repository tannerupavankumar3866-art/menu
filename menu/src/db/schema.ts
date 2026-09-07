import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
    otp: text("otp"),
    createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});


export const restaurant = sqliteTable("restaurant", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    owner: integer("owner").notNull().references(() => user.id),

    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),

    domain: text("domain").unique(),
    banner: text("banner", { mode: "json" }).$type<string[]>().default([]),
    logo: text("logo"),
    favicon: text("favicon"),

    currency: text("currency", { enum: ["INR", "USD", "AED", "GBP"] }).notNull().default("INR"),
    countryCode: text("country_code", { enum: ["91", "971"] }).notNull().default("91"),

    whatsAppNumber: text("whatsapp_number"),
    // Settings
    settings: text("settings", { mode: "json" }),
    // membership
    membershipType: text("membership_type", { enum: ["trial", "basic", "lifetime"] }).default("trial"),
    createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
    expiryDate: integer("expiry_date"),
});

export const category = sqliteTable("category", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    order: integer("order").notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    restaurantId: integer("restaurant_id").notNull().references(() => restaurant.id)
});

export const menu = sqliteTable("menu", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    images: text("images", { mode: "json" }).$type<{ url: string }[]>().default([]),
    price: integer("price").notNull().default(0),
    salePrice: integer("sale_price").default(0),
    categories: text("categories", { mode: "json" }).$type<{ id: number }[]>().default([]),
    isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
   
    
    restaurantId: integer("restaurant_id").notNull().references(() => restaurant.id),

    type: text("type", { enum: ["simple", "variant"] }).notNull().default("simple"),
    minOrder: integer("min_order").notNull().default(1),

    createdAt: integer("created_at")
        .notNull()
        .default(sql`(strftime('%s','now') * 1000)`),
});

// Variant table
export const variant = sqliteTable("variant", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    value: text("value").notNull(),
    price: integer("price").notNull().default(0),

    menuId: integer("menu_id").notNull().references(() => menu.id),
});

// AddOns table
export const addons = sqliteTable("addons", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    price: integer("price").notNull().default(0),

    menuId: integer("menu_id").notNull().references(() => menu.id),
});



export const platformData =  sqliteTable("platform_data", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentType: text("payment_type", { enum: ["whatsapp", "razorpay"] }).default("whatsapp"),
    whatsapp:text("whatsapp"),
    adminEmail:text("admin_email"),
    razorpayKeyId:text("razorpay_key_id"),
    razorpayKeySecret:text("razorpay_key_secret"),    
});


export const plans = sqliteTable("plans", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    name: text("name").notNull(),
    description: text("description").notNull(),

    price: integer("price").notNull().default(0),
    originalPrice: integer("original_price").default(0),

    type: text("type", {
        enum: ["monthly", "yearly", "lifetime"],
    }).notNull().default("monthly"),

    features: text("features"), // store as JSON stringified array
    cta: text("cta").default("Get Plan"),

    popular: integer("popular", { mode: "boolean" })
        .notNull()
        .default(false),

    createdAt: integer("created_at")
        .notNull()
        .default(sql`(strftime('%s','now') * 1000)`),
});  