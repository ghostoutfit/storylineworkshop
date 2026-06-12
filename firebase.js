// Storyline Workshop — Firebase Firestore integration
// Handles likes and comments only. Resource data comes from Google Sheets.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let db = null;
let firebaseAvailable = false;

export function initFirebase(firebaseConfig) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseAvailable = true;
    console.log('Firebase initialized successfully');
  } catch (err) {
    console.warn('Firebase initialization failed. Likes and comments will not be available.', err);
    firebaseAvailable = false;
  }
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function getLikes(resourceId) {
  if (!firebaseAvailable) return 0;
  try {
    const ref = doc(db, 'resources', resourceId);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    const snap = await Promise.race([getDoc(ref), timeout]);
    if (snap.exists()) {
      return snap.data().likes ?? 0;
    }
    return 0;
  } catch (err) {
    console.warn('Failed to get likes for', resourceId, err);
    return 0;
  }
}

export async function incrementLike(resourceId) {
  if (!firebaseAvailable) return;
  try {
    const ref = doc(db, 'resources', resourceId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { likes: increment(1) });
    } else {
      await setDoc(ref, { likes: 1 });
    }
  } catch (err) {
    console.warn('Failed to increment like for', resourceId, err);
  }
}

export async function decrementLike(resourceId) {
  if (!firebaseAvailable) return;
  try {
    const ref = doc(db, 'resources', resourceId);
    await updateDoc(ref, { likes: increment(-1) });
  } catch (err) {
    console.warn('Failed to decrement like for', resourceId, err);
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(resourceId) {
  if (!firebaseAvailable) return [];
  try {
    const commentsRef = collection(db, 'resources', resourceId, 'comments');
    const q = query(commentsRef, orderBy('timestamp', 'asc'));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
    const snapshot = await Promise.race([getDocs(q), timeout]);
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: d.data().timestamp?.toDate?.() ?? null
    }));
  } catch (err) {
    console.warn('Failed to get comments for', resourceId, err);
    throw err;
  }
}

export async function addComment(resourceId, name, text) {
  if (!firebaseAvailable) throw new Error('Firebase not available');
  const commentsRef = collection(db, 'resources', resourceId, 'comments');
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
  const ref = await Promise.race([
    addDoc(commentsRef, {
      name: name.trim(),
      text: text.trim(),
      timestamp: serverTimestamp()
    }),
    timeout
  ]);
  return ref.id;
}

export async function deleteComment(resourceId, commentId) {
  if (!firebaseAvailable) throw new Error('Firebase not available');
  const ref = doc(db, 'resources', resourceId, 'comments', commentId);
  await deleteDoc(ref);
}

export function isFirebaseAvailable() {
  return firebaseAvailable;
}
