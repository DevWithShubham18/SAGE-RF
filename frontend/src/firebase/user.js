import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";

export async function createUserProfile(user) {
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      email: user.email || "",
      displayName: user.displayName || "",
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
  } else {
    await setDoc(
      userRef,
      {
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
  }

  const updated = await getDoc(userRef);

  return {
    id: updated.id,
    ...updated.data(),
  };
}