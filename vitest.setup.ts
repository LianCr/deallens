import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { primeSttAvailabilityForTests } from "./src/lib/sttAvailability";
import { resetLangPrefForTests } from "./src/lib/langPref";

// Voice stores are module-level singletons; pin them per test so no
// unit test ever hits the network probe or inherits a language toggle.
// Tests that exercise the server-STT tier prime "enabled" themselves.
beforeEach(() => {
  primeSttAvailabilityForTests("disabled");
  resetLangPrefForTests();
});
