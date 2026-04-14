import path from "path";
import { storage } from "../config/firebase";

export async function uploadFile(
    buffer: Buffer,
    destination: string,
    contentType: string,
): Promise<string> {
    const bucket = storage.bucket('dd-into-3d.firebasestorage.app');
    const file = bucket.file(destination);
    await file.save(buffer, { metadata: { contentType } });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

export function sanitizeFilename(filename: string): string {
    return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}
