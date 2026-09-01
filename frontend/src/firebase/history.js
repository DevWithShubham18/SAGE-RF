import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { db, auth } from "./firebase";

/*
 * ============================================================
 * SAGE-RF FIREBASE HISTORY
 * ============================================================
 *
 * Firestore structure:
 *
 * users/
 *   {firebaseUid}/
 *     analyses/
 *       {analysisId}
 *
 * The Firebase UID is always taken from the authenticated
 * Firebase session. This prevents accidentally writing history
 * under another account.
 *
 * Existing App.jsx API remains unchanged:
 *
 *   saveAnalysisHistory(user, file, result)
 *   loadAnalysisHistory(user)
 *
 * ============================================================
 */


/* ============================================================
   LIMITS
   ============================================================ */

/*
 * Firestore has a 1 MiB document limit.
 *
 * We deliberately keep the stored analysis comfortably below
 * that limit instead of trying to store every raw DSP array.
 */

const MAX_ARRAY_LENGTH = 512;
const MAX_NESTED_ARRAY_LENGTH = 256;


/* ============================================================
   AUTHENTICATED USER
   ============================================================ */

/**
 * Return the currently authenticated Firebase user.
 *
 * We intentionally use auth.currentUser instead of trusting
 * an arbitrary UID supplied by the caller.
 */
function getAuthenticatedUser(expectedUser = null) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error(
      "You must be signed in to save or load analysis history."
    );
  }

  /*
   * If a user object was supplied by App.jsx, make sure it
   * represents the same Firebase account as the live session.
   */
  if (
    expectedUser?.uid &&
    expectedUser.uid !== currentUser.uid
  ) {
    throw new Error(
      "Firebase account changed. Please retry the operation."
    );
  }

  return currentUser;
}


/* ============================================================
   SAFE VALUE CLEANING
   ============================================================ */

/**
 * Convert arbitrary analysis JSON into Firestore-safe data.
 *
 * This protects Firestore from:
 *
 * - undefined
 * - NaN
 * - Infinity
 * - functions
 * - circular references
 * - excessively large arrays
 *
 * The analysis engine normally returns plain JSON, but keeping
 * this defensive layer makes history much more reliable.
 */
function sanitizeValue(
  value,
  depth = 0,
  arrayLimit = MAX_ARRAY_LENGTH,
  seen = new WeakSet()
) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === "string") {
    return value;
  }

  if (valueType === "boolean") {
    return value;
  }

  if (valueType === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  /*
   * BigInt, functions, symbols, etc. are not useful in a
   * history document.
   */
  if (
    valueType !== "object"
  ) {
    return null;
  }

  /*
   * Prevent unexpectedly deep / pathological objects.
   */
  if (depth > 8) {
    return null;
  }

  /*
   * Handle Date objects.
   */
  if (value instanceof Date) {
    return value.toISOString();
  }

  /*
   * Avoid circular references.
   */
  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  /*
   * Arrays can contain thousands/millions of DSP samples.
   *
   * Only retain a bounded preview.
   */
  if (Array.isArray(value)) {
    const result = [];

    const limit =
      depth <= 2
        ? arrayLimit
        : MAX_NESTED_ARRAY_LENGTH;

    const length = Math.min(
      value.length,
      limit
    );

    for (let index = 0; index < length; index += 1) {
      result.push(
        sanitizeValue(
          value[index],
          depth + 1,
          MAX_NESTED_ARRAY_LENGTH,
          seen
        )
      );
    }

    return result;
  }

  /*
   * Plain object.
   */
  const output = {};

  for (const [key, childValue] of Object.entries(
    value
  )) {
    /*
     * Skip obviously dangerous / irrelevant fields.
     */
    if (
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }

    output[key] = sanitizeValue(
      childValue,
      depth + 1,
      MAX_NESTED_ARRAY_LENGTH,
      seen
    );
  }

  return output;
}


/* ============================================================
   COMPACT HISTORY RESULT
   ============================================================ */

/**
 * Build the result stored inside a history record.
 *
 * IMPORTANT:
 *
 * App.jsx expects:
 *
 *   record.result
 *
 * when the user clicks VIEW.
 *
 * Therefore we preserve the result object and its important
 * analysis sections instead of replacing it with only summary
 * information.
 *
 * Large DSP arrays are trimmed to a safe preview.
 */
function buildHistoryResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error(
      "Invalid analysis result."
    );
  }

  /*
   * First sanitize the entire result.
   *
   * This removes undefined / invalid numeric values and caps
   * arrays recursively.
   */
  const sanitized = sanitizeValue(
    result
  );

  /*
   * Preserve the complete top-level structure after
   * sanitization.
   *
   * This means future fields added by your backend will not
   * silently disappear.
   */
  const compactResult = {
    ...sanitized,
  };

  /*
   * Explicitly make the important large DSP sections even
   * more conservative.
   *
   * Your Workspace/Fourier UI already treats these as arrays.
   */

  if (
    compactResult.fourier &&
    typeof compactResult.fourier === "object"
  ) {
    const fourier =
      compactResult.fourier;

    if (
      Array.isArray(
        fourier.frequencies_hz
      )
    ) {
      fourier.frequencies_hz =
        fourier.frequencies_hz.slice(
          0,
          MAX_ARRAY_LENGTH
        );
    }

    if (
      Array.isArray(
        fourier.power_db
      )
    ) {
      fourier.power_db =
        fourier.power_db.slice(
          0,
          MAX_ARRAY_LENGTH
        );
    }

    if (
      Array.isArray(
        fourier.peak_frequencies_hz
      )
    ) {
      fourier.peak_frequencies_hz =
        fourier.peak_frequencies_hz.slice(
          0,
          MAX_NESTED_ARRAY_LENGTH
        );
    }

    if (
      Array.isArray(
        fourier.times_seconds
      )
    ) {
      fourier.times_seconds =
        fourier.times_seconds.slice(
          0,
          MAX_NESTED_ARRAY_LENGTH
        );
    }
  }

  /*
   * Laplace data can also contain large arrays.
   *
   * We don't assume a single exact backend schema here;
   * sanitizeValue already limits nested arrays.
   */

  return compactResult;
}


/* ============================================================
   DOCUMENT SIZE PROTECTION
   ============================================================ */

/**
 * Estimate the JSON size of a value.
 *
 * This isn't the exact Firestore wire size, but it provides a
 * useful safety check before writing.
 */
function estimateSizeBytes(value) {
  try {
    return new Blob([
      JSON.stringify(value),
    ]).size;
  } catch {
    return 0;
  }
}


/**
 * If the result is still unexpectedly large, create a smaller
 * fallback result while preserving the important sections
 * required by the UI.
 */
function enforceSafeResultSize(result) {
  const estimatedSize =
    estimateSizeBytes(result);

  /*
   * Keep substantial headroom below Firestore's 1 MiB
   * document limit because the history document also contains
   * metadata, filename, timestamps, etc.
   */
  const SAFE_RESULT_LIMIT =
    650 * 1024;

  if (
    estimatedSize <= SAFE_RESULT_LIMIT
  ) {
    return result;
  }

  /*
   * Emergency compact version.
   *
   * Summary information is preserved.
   */
  const compact = {
    metadata:
      sanitizeValue(result.metadata, 0, 128),

    spectrum:
      sanitizeValue(result.spectrum, 0, 128),

    modulation:
      sanitizeValue(result.modulation, 0, 128),

    detections: {
      candidate_count:
        result.detections?.candidate_count ??
        0,

      candidates:
        Array.isArray(
          result.detections?.candidates
        )
          ? result.detections.candidates.slice(
              0,
              64
            )
          : [],
    },

    diagnostics:
      sanitizeValue(
        result.diagnostics,
        0,
        64
      ),

    /*
     * Keep a small Fourier preview so the existing
     * workstation can still display useful data.
     */
    fourier: result.fourier
      ? {
          nfft:
            result.fourier.nfft ??
            null,

          sample_rate:
            result.fourier.sample_rate ??
            null,

          frequencies_hz:
            Array.isArray(
              result.fourier.frequencies_hz
            )
              ? result.fourier.frequencies_hz.slice(
                  0,
                  128
                )
              : [],

          power_db:
            Array.isArray(
              result.fourier.power_db
            )
              ? result.fourier.power_db.slice(
                  0,
                  128
                )
              : [],

          peak_frequencies_hz:
            Array.isArray(
              result.fourier
                .peak_frequencies_hz
            )
              ? result.fourier.peak_frequencies_hz.slice(
                  0,
                  64
                )
              : [],

          times_seconds:
            Array.isArray(
              result.fourier.times_seconds
            )
              ? result.fourier.times_seconds.slice(
                  0,
                  64
                )
              : [],
        }
      : null,
  };

  return sanitizeValue(
    compact
  );
}


/* ============================================================
   SAVE HISTORY
   ============================================================ */

export async function saveAnalysisHistory(
  user,
  file,
  result
) {
  if (!file) {
    throw new Error(
      "No recording was provided."
    );
  }

  if (!result) {
    throw new Error(
      "No analysis result was provided."
    );
  }

  /*
   * IMPORTANT:
   *
   * Verify the real Firebase session before constructing the
   * Firestore path.
   */
  const authenticatedUser =
    getAuthenticatedUser(user);

  const uid =
    authenticatedUser.uid;

  if (!uid) {
    throw new Error(
      "Firebase account has no UID."
    );
  }

  /*
   * Build:
   *
   * users/{uid}/analyses
   */
  const historyRef = collection(
    db,
    "users",
    uid,
    "analyses"
  );

  /*
   * Prepare safe analysis payload.
   */
  const safeResult =
    enforceSafeResultSize(
      buildHistoryResult(result)
    );

  /*
   * Keep the same document structure your existing HistoryPage
   * expects.
   */
  const historyData = {
    filename:
      typeof file.name === "string"
        ? file.name
        : "Untitled signal",

    fileSize:
      Number.isFinite(file.size)
        ? file.size
        : 0,

    fileType:
      typeof file.type === "string" &&
      file.type.length > 0
        ? file.type
        : "unknown",

    uploadedAt:
      serverTimestamp(),

    /*
     * Store the UID as additional metadata.
     *
     * This is NOT used to provide security — Firestore rules
     * already enforce account isolation — but it is useful for
     * debugging and auditing.
     */
    userId: uid,

    metadata: {
      sourceFormat:
        result.metadata?.source_format ??
        "",

      sampleRate:
        result.metadata?.sample_rate ??
        null,

      duration:
        result.metadata?.duration_seconds ??
        null,

      sampleCount:
        result.metadata?.sample_count ??
        null,

      meanPower:
        result.metadata?.mean_power ??
        null,
    },

    spectrum: {
      peakFrequency:
        result.spectrum
          ?.peak_frequency_hz ??
        null,

      occupiedBandwidth:
        result.spectrum
          ?.occupied_bandwidth_hz ??
        null,

      snr:
        result.spectrum?.snr_db ??
        null,
    },

    modulation: {
      name:
        result.modulation
          ?.modulation ??
        null,

      confidence:
        result.modulation
          ?.confidence ??
        null,
    },

    detectionCount:
      result.detections
        ?.candidate_count ??
      0,

    /*
     * Existing App.jsx depends on this field when VIEW is
     * clicked.
     */
    result: safeResult,
  };

  /*
   * Final size sanity check.
   */
  const estimatedDocumentSize =
    estimateSizeBytes(
      historyData
    );

  /*
   * 900 KB is intentionally below Firestore's 1 MiB limit.
   */
  if (
    estimatedDocumentSize >
    900 * 1024
  ) {
    throw new Error(
      "Analysis result is too large to store safely in history."
    );
  }

  try {
    const docRef =
      await addDoc(
        historyRef,
        historyData
      );

    console.log(
      "SAGE-RF history saved:",
      {
        id: docRef.id,
        uid,
        filename:
          historyData.filename,
        estimatedSize:
          `${Math.round(
            estimatedDocumentSize / 1024
          )} KB`,
      }
    );

    return docRef.id;
  } catch (error) {
    console.error(
      "SAGE-RF Firestore history save failed:",
      {
        code: error?.code,
        message: error?.message,
        uid,
        filename:
          historyData.filename,
      }
    );

    /*
     * Give App.jsx a useful error while preserving the
     * existing behavior where the main RF analysis itself
     * remains successful.
     */
    if (
      error?.code ===
      "permission-denied"
    ) {
      throw new Error(
        "Firebase denied history access for this account. Check Firestore rules."
      );
    }

    if (
      error?.code ===
      "resource-exhausted"
    ) {
      throw new Error(
        "Firebase history document is too large."
      );
    }

    if (
      error?.code ===
      "failed-precondition"
    ) {
      throw new Error(
        "Firebase history query/storage is not ready. Check your Firestore configuration."
      );
    }

    throw error;
  }
}


/* ============================================================
   LOAD HISTORY
   ============================================================ */

export async function loadAnalysisHistory(
  user
) {
  /*
   * No authenticated user means there must be NO history.
   *
   * This also prevents stale history from one account from
   * accidentally being displayed after logout/login.
   */
  if (!user) {
    return [];
  }

  /*
   * Verify that the supplied user is the currently
   * authenticated Firebase account.
   */
  const authenticatedUser =
    getAuthenticatedUser(user);

  const uid =
    authenticatedUser.uid;

  if (!uid) {
    return [];
  }

  /*
   * IMPORTANT:
   *
   * Only read:
   *
   * users/{CURRENT_FIREBASE_UID}/analyses
   *
   * Therefore Account A cannot accidentally load Account B's
   * history.
   */
  const historyRef = collection(
    db,
    "users",
    uid,
    "analyses"
  );

  const historyQuery = query(
    historyRef,
    orderBy(
      "uploadedAt",
      "desc"
    )
  );

  try {
    const snapshot =
      await getDocs(
        historyQuery
      );

    const records =
      snapshot.docs.map(
        (document) => ({
          id: document.id,
          ...document.data(),
        })
      );

    console.log(
      "SAGE-RF history loaded:",
      {
        uid,
        count: records.length,
      }
    );

    return records;
  } catch (error) {
    console.error(
      "SAGE-RF Firestore history load failed:",
      {
        code: error?.code,
        message: error?.message,
        uid,
      }
    );

    if (
      error?.code ===
      "permission-denied"
    ) {
      throw new Error(
        "Firebase denied history access for this account. Check Firestore rules."
      );
    }

    if (
      error?.code ===
      "failed-precondition"
    ) {
      throw new Error(
        "Firestore needs an index or is not configured correctly for history sorting."
      );
    }

    throw error;
  }
}