import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";
import serviceAccountJson from "../src/config/firebase.json";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const uid = process.argv[2];
if (!uid) {
    console.error("Error: No UID provided.\nUsage: npm run make-admin -- <userUID>");
    process.exit(1);
}

const serviceAccount = serviceAccountJson as admin.ServiceAccount;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

admin
    .auth()
    .setCustomUserClaims(uid, { admin: true })
    .then(() => {
        console.log(`Admin claim set for user: ${uid}`);
        console.log("The user must sign out and sign back in for the claim to take effect.");
        process.exit(0);
    })
    .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to set admin claim:", message);
        process.exit(1);
    });
