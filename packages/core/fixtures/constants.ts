import path from "path";

export const FIXTURE_PROJECT_DIR = path.resolve(import.meta.env.PWD, "packages/core/fixtures");

export const FIXTURE_EXISTING_FILE_IN_DIST = "test.css";

export const FIXTURE_EXISTING_FILE_GZ_IN_DIST = FIXTURE_EXISTING_FILE_IN_DIST + ".gz";
