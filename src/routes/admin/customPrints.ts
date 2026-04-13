import express, { Request, Response } from "express";
import { db } from "../../config/firebase";
import adminAuthMiddleware from "../../middleware/adminAuth";

const router = express.Router();
const VALID_STATUSES = ["submitted", "quoted", "confirmed", "printing", "shipped"];

router.get("/", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        let query: FirebaseFirestore.Query = db
            .collection("custom_print_requests")
            .orderBy("createdAt", "desc");

        if (status && VALID_STATUSES.includes(String(status))) {
            query = db
                .collection("custom_print_requests")
                .where("status", "==", String(status))
                .orderBy("createdAt", "desc");
        }

        const snapshot = await query.get();
        const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.json({ requests });
    } catch (err) {
        console.error("admin GET /custom-prints error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const requestId = String(req.params.id);
        const doc = await db.collection("custom_print_requests").doc(requestId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Custom print request not found" });
        }

        return res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        console.error("admin GET /custom-prints/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/:id/quote", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { quote, status } = req.body as { quote?: unknown; status?: string };
        if (quote == null || Number.isNaN(Number(quote)) || Number(quote) < 0) {
            return res.status(400).json({ error: "A valid quote amount is required" });
        }

        const update: { quote: number; status: string } = {
            quote: Number(quote),
            status: "quoted",
        };

        if (status && VALID_STATUSES.includes(status)) {
            update.status = status;
        }

        const requestId = String(req.params.id);
        const ref = db.collection("custom_print_requests").doc(requestId);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Custom print request not found" });
        }

        await ref.update(update);
        return res.json({ message: "Quote updated", ...update });
    } catch (err) {
        console.error("admin PUT /custom-prints/:id/quote error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/:id/status", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { status } = req.body as { status?: string };
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
        }

        const requestId = String(req.params.id);
        const ref = db.collection("custom_print_requests").doc(requestId);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Custom print request not found" });
        }

        await ref.update({ status });
        return res.json({ message: "Status updated", status });
    } catch (err) {
        console.error("admin PUT /custom-prints/:id/status error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
