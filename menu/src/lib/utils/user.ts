import { SignJWT } from "jose";

export async function createToken(
  email: string,
  id: number,
  jwtSecret: string // ✅ take secret as param
) {
  const secret = new TextEncoder().encode(jwtSecret);

  const token = await new SignJWT({ email, id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);

  return token;
}