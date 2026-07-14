import { describe, expect, test } from "vitest";
import { dealPath, parseVehicleSegments } from "./vehicleUrl";

describe("dealPath", () => {
  test("lowercases and encodes segments, carries the quote", () => {
    expect(dealPath("Honda", 2022, "Civic", 24500)).toBe(
      "/deal/honda/2022/civic?quote=24500",
    );
  });

  test("model names with spaces survive the round trip", () => {
    const path = dealPath("Land Rover", 2023, "Range Rover Sport");
    const segments = path.replace("/deal/", "").split("/");
    expect(parseVehicleSegments(segments)).toEqual({
      make: "land rover",
      year: 2023,
      model: "range rover sport",
    });
  });

  test("omits the quote when absent", () => {
    expect(dealPath("Honda", 2022, "Civic")).toBe("/deal/honda/2022/civic");
    expect(dealPath("Honda", 2022, "Civic", "")).toBe("/deal/honda/2022/civic");
  });
});

describe("parseVehicleSegments", () => {
  test("rejects malformed URLs instead of guessing", () => {
    expect(parseVehicleSegments([])).toBeNull();
    expect(parseVehicleSegments(["honda", "2022"])).toBeNull();
    expect(parseVehicleSegments(["honda", "notayear", "civic"])).toBeNull();
  });
});
