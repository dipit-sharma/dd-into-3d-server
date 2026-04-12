const path = require("path");
const { storage } = require("../config/firebase");

/**
 * Uploads a buffer to Firebase Storage and returns the public URL.
 * @param {Buffer} buffer
 * @param {string} destination - Storage path, e.g. "products/abc/image.jpg"
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL
 */
async function uploadFile(buffer, destination, contentType) {
  const bucket = storage.bucket();
  const file = bucket.file(destination);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

/**
 * Strips directory traversal and unsafe characters from a filename.
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

module.exports = { uploadFile, sanitizeFilename };
