const express = require("express");
const multer = require("multer");
const path = require("path");
const { db, admin } = require("../config/firebase");
const authMiddleware = require("../middleware/auth");
const { uploadFile, sanitizeFilename } = require("../utils/storage");

const router = express.Router();

const ALLOWED_EXTENSIONS = [".stl", ".obj", ".3mf"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        new Error(
          `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        ),
      );
    }
    cb(null, true);
  },
});

/**
 * POST /api/custom-prints — Auth required
 * Accepts a 3D file upload plus metadata and creates a custom print request.
 * Form fields: file (binary), description, material, color, quantity
 */
router.post(
  "/",
  authMiddleware,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { uid } = req.user;

      if (!req.file) {
        return res.status(400).json({ error: "3D file is required" });
      }

      const { description, material, color, quantity } = req.body;
      const filename = `${Date.now()}_${sanitizeFilename(req.file.originalname)}`;

      const fileUrl = await uploadFile(
        req.file.buffer,
        `custom-prints/${uid}/${filename}`,
        "application/octet-stream",
      );

      const request = {
        userId: uid,
        fileName: req.file.originalname,
        fileUrl,
        description: description ? String(description).trim() : "",
        material: material ? String(material).trim() : "",
        color: color ? String(color).trim() : "",
        quantity: quantity ? Math.max(1, parseInt(quantity, 10)) : 1,
        status: "submitted",
        quote: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ref = await db.collection("custom_print_requests").add(request);
      return res.status(201).json({ id: ref.id, ...request });
    } catch (err) {
      console.error("POST /custom-prints error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * GET /api/custom-prints — Auth required
 * Returns all custom print requests belonging to the authenticated user.
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const snapshot = await db
      .collection("custom_print_requests")
      .where("userId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.json({ requests });
  } catch (err) {
    console.error("GET /custom-prints error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/custom-prints/:id — Auth required
 * Returns a single custom print request (only if it belongs to the requester).
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await db
      .collection("custom_print_requests")
      .doc(req.params.id)
      .get();
    if (!doc.exists)
      return res.status(404).json({ error: "Request not found" });
    const data = { id: doc.id, ...doc.data() };
    if (data.userId !== req.user.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(data);
  } catch (err) {
    console.error("GET /custom-prints/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
