import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { primeSttAvailabilityForTests } from "./src/lib/sttAvailability";

// The STT-availability store is a module-level singleton; pin it per
// test so no unit test ever hits the network probe. Tests that exercise
// the server-STT tier prime "enabled" themselves.
beforeEach(() => {
  primeSttAvailabilityForTests("disabled");
});
