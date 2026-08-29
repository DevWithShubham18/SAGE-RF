import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";

export async function saveAnalysisHistory(user, file, result) {
  if (!user || !file || !result) {
    throw new Error("Missing user, file, or analysis result.");
  }

  const historyRef = collection(
    db,
    "users",
    user.uid,
    "analyses"
  );

  const docRef = await addDoc(historyRef, {
    filename: file.name,
    fileSize: file.size,
    fileType: file.type || "unknown",

    uploadedAt: serverTimestamp(),

    metadata: {
      sourceFormat:
        result.metadata?.source_format || "",
      sampleRate:
        result.metadata?.sample_rate || null,
      duration:
        result.metadata?.duration_seconds || null,
      sampleCount:
        result.metadata?.sample_count || null,
      meanPower:
        result.metadata?.mean_power || null,
    },

    spectrum: {
      peakFrequency:
        result.spectrum?.peak_frequency_hz || null,
      occupiedBandwidth:
        result.spectrum?.occupied_bandwidth_hz || null,
      snr:
        result.spectrum?.snr_db || null,
    },

    modulation: {
      name:
        result.modulation?.modulation || null,
      confidence:
        result.modulation?.confidence || null,
    },

    detectionCount:
      result.detections?.candidate_count || 0,
  });

  return docRef.id;
}
