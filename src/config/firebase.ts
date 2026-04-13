import admin from "firebase-admin";
import serviceAccountJson from "./firebase.json";

const serviceAccount = serviceAccountJson as admin.ServiceAccount;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
const storage = admin.storage();

export { admin, db, storage };
