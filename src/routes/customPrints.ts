import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { admin, db } from "../config/firebase";
import authMiddleware from "../middleware/auth";
import { sanitizeFilename, uploadFile } from "../utils/storage";

const router = express.Router();
const ALLOWED_EXTENSIONS = [".stl", ".obj", ".3mf"];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
        }
        cb(null, true);
    },
});

router.post(
    "/",
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
        upload.single("file")(req, res, (err: unknown) => {
            if (err && err instanceof Error) {
                return res.status(400).json({ error: err.message });
            }
            return next();
        });
    },
    async (req: Request, res: Response) => {
        try {
            const { uid } = req.user!;

            if (!req.file) {
                return res.status(400).json({ error: "3D file is required" });
            }

            const { description, material, color, quantity } = req.body as {
                description?: unknown;
                material?: unknown;
                color?: unknown;
                quantity?: unknown;
            };

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
                quantity: quantity ? Math.max(1, parseInt(String(quantity), 10)) : 1,
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

router.get("/", authMiddleware, async (req: Request, res: Response) => {
    try {
        const snapshot = await db
            .collection("custom_print_requests")
            .where("userId", "==", req.user!.uid)
            .orderBy("createdAt", "desc")
            .get();

        const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.json({ requests });
    } catch (err) {
        console.error("GET /custom-prints error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
        const requestId = String(req.params.id);
        const doc = await db.collection("custom_print_requests").doc(requestId).get();
        if (!doc.exists) return res.status(404).json({ error: "Request not found" });

        const data = { id: doc.id, ...doc.data() } as Record<string, unknown>;
        if (data.userId !== req.user!.uid) {
            return res.status(403).json({ error: "Forbidden" });
        }

        return res.json(data);
    } catch (err) {
        console.error("GET /custom-prints/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
