import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { primeSttAvailabilityForTests } from "./src/lib/sttAvailability";
import { primeTtsAvailabilityForTests } from "./src/lib/ttsAvailability";

// The voice availability stores are module-level singletons; pin them
// per test so no unit test ever hits a network probe. Tests that
// exercise a voice tier prime "enabled" themselves.
beforeEach(() => {
  primeSttAvailabilityForTests("disabled");
  primeTtsAvailabilityForTests("disabled");
});
