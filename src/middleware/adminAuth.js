const { admin } = require("../config/firebase");

async function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    if (!decodedToken.admin) {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }
    req.user = decodedToken;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

module.exports = adminAuthMiddleware;
