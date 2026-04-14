import path from "path";
import { storage } from "../config/firebase";

const STORAGE_BUCKET = "dd-into-3d.firebasestorage.app";

export async function uploadFile(
    buffer: Buffer,
    destination: string,
    contentType: string,
): Promise<string> {
    const bucket = storage.bucket(STORAGE_BUCKET);
    const file = bucket.file(destination);
    await file.save(buffer, { metadata: { contentType } });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

function getStoragePathFromPublicUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== "storage.googleapis.com") {
            return null;
        }

        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length < 2 || parts[0] !== STORAGE_BUCKET) {
            return null;
        }

        return decodeURIComponent(parts.slice(1).join("/"));
    } catch {
        return null;
    }
}

export async function deleteFileByPublicUrl(url: string): Promise<void> {
    const filePath = getStoragePathFromPublicUrl(url);
    if (!filePath) {
        return;
    }

    const bucket = storage.bucket(STORAGE_BUCKET);
    try {
        await bucket.file(filePath).delete();
    } catch (error) {
        const err = error as { code?: number | string };
        if (err.code === 404 || err.code === "404") {
            return;
        }
        throw error;
    }
}

export async function deleteFilesByPublicUrls(urls: string[]): Promise<void> {
    await Promise.all(urls.map((url) => deleteFileByPublicUrl(url)));
}

export function sanitizeFilename(filename: string): string {
    return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}
