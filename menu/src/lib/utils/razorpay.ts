export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
}

export async function createRazorpayOrder({
    keyId,
    keySecret,
    amount,
    receipt,
}: {
    keyId: string;
    keySecret: string;
    amount: number;
    receipt: string;
}): Promise<RazorpayOrder> {
    const basicAuth = btoa(`${keyId}:${keySecret}`);

    const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
            amount, // amount in paise
            currency: "INR",
            receipt,
            payment_capture: 1,
        }),
    });

    const data = (await res.json()) as RazorpayOrder;

    if (!res.ok) {
        console.error("Razorpay error:", data);
        throw new Error("Failed to create Razorpay order");
    }

    return data;
}



export async function generateHmacSHA256(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}