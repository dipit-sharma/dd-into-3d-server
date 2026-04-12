const express = require("express");
const { admin, db } = require("../config/firebase");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/auth/verify-token
 * Verifies Firebase ID token and creates or fetches the user document in Firestore.
 */
router.post("/verify-token", authMiddleware, async (req, res) => {
  try {
    const { uid, phone_number } = req.user;
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const newUser = {
        uid,
        phone: phone_number || "",
        name: "",
        email: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await userRef.set(newUser);
      return res.status(201).json({ user: newUser, created: true });
    }

    return res.json({ user: { uid, ...userDoc.data() }, created: false });
  } catch (err) {
    console.error("verify-token error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/auth/profile
 * Updates the authenticated user's name and/or email.
 */
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const { name, email } = req.body;
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (email !== undefined) update.email = String(email).trim();
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    await db.collection("users").doc(uid).update(update);
    return res.json({ message: "Profile updated" });
  } catch (err) {
    console.error("profile update error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
