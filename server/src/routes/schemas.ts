// JSON-schema fragments for route params. Docker would reject bad input anyway;
// validating first keeps odd strings out of Engine API URLs.

/** Container / volume / network names and ids. */
export const NAME_OR_ID = "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$";
/** Image ids: full or short hex, optionally sha256:-prefixed. */
export const IMAGE_ID = "^(sha256:)?[a-f0-9]{12,64}$";
/** Compose project names: lowercase letters, digits, dashes and underscores. */
export const PROJECT_NAME = "^[a-z0-9][a-z0-9_-]{0,254}$";
/** Image references: [registry[:port]/]path[:tag][@digest]. */
export const IMAGE_REF = "^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$";

export const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", pattern: NAME_OR_ID } },
} as const;

export const forceQuery = {
  type: "object",
  properties: { force: { type: "boolean", default: false } },
} as const;
