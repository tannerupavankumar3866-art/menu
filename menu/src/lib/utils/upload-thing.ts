// src/lib/uploadthing.ts
import { UTApi } from "uploadthing/server";

/**
 * Create UTApi instance for Workers
 */
export function getUtapi(env: { UPLOADTHING_TOKEN: string }) {
  // Hack: inject into process.env for UTApi
  (globalThis as any).process ??= { env: {} };
  (globalThis as any).process.env.UPLOADTHING_TOKEN = env.UPLOADTHING_TOKEN;

  return new UTApi();
}

/**
 * Delete file(s) from UploadThing
 */
export async function deleteFileFromUploadThing(
  env: { UPLOADTHING_TOKEN: string },
  url: string
) {
  const utapi = getUtapi(env);

  // URLs look like https://utfs.io/f/<fileKey>
  const parts = url.split("/");
  const fileKey = parts[parts.length - 1];

  return await utapi.deleteFiles(fileKey);
}