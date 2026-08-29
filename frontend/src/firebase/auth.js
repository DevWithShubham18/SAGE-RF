import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "./firebase";

export async function registerUser(email, password) {
  const credential =
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

  return credential.user;
}

export async function loginUser(email, password) {
  const credential =
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  return credential.user;
}

export async function logoutUser() {
  await signOut(auth);
}