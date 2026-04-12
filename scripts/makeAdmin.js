/**
 * Usage:  node scripts/makeAdmin.js <userUID>
 *
 * Sets the Firebase custom claim { admin: true } on the given user.
 * The user must already exist (i.e. must have signed in at least once).
 *
 * Find the UID in Firebase Console → Authentication → Users.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const admin = require("firebase-admin");

const uid = process.argv[2];

if (!uid) {
  console.error(
    "Error: No UID provided.\nUsage: node scripts/makeAdmin.js <userUID>",
  );
  process.exit(1);
}

var serviceAccount = require("../src/config/firebase.json");
if (!admin.apps.length) {
  //   admin.initializeApp({
  //     credential: admin.credential.cert({
  //       projectId: process.env.FIREBASE_PROJECT_ID,
  //       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  //       privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  //     }),
  //     storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  //   });

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`✓ Admin claim set for user: ${uid}`);
    console.log(
      "The user must sign out and sign back in for the claim to take effect.",
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to set admin claim:", err.message);
    process.exit(1);
  });
