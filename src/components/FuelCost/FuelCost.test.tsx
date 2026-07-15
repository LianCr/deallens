import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { annualFuelCost } from "@/domain/fuelCost";
import { FuelCost } from "./FuelCost";

const realPriceProps = {
  combinedMpg: 35,
  feModelName: "Civic 4Dr",
  fuelType: "Regular",
  dollarsPerGallon: 4.15,
  priceSource: "fueleconomy.gov",
};

describe("FuelCost", () => {
  test("with a real weekly price: attributed sentence, cost uses the real price", () => {
    render(<FuelCost {...realPriceProps} />);
    const expected = annualFuelCost({
      combinedMpg: 35,
      milesPerYear: 12_000,
      dollarsPerGallon: 4.15,
    })!;
    expect(screen.getByTestId("fuel-annual-cost")).toHaveTextContent(
      `$${expected.toLocaleString("en-US")}`,
    );
    expect(screen.getByTestId("fuel-cost")).toHaveTextContent(
      "at this week's national average regular price, $4.15/gallon (fueleconomy.gov)",
    );
    // The fallback assumption wording must not appear alongside real data.
    expect(screen.getByTestId("fuel-cost")).not.toHaveTextContent("$3.60/gallon");
  });

  test("without a real price: falls back to the explicit $3.60 assumption", () => {
    render(
      <FuelCost {...realPriceProps} dollarsPerGallon={null} priceSource={null} />,
    );
    // 12000 / 35 * 3.6 = 1234.28… → 1234
    expect(screen.getByTestId("fuel-annual-cost")).toHaveTextContent("$1,234");
    expect(screen.getByTestId("fuel-cost")).toHaveTextContent(
      "and $3.60/gallon",
    );
    expect(screen.getByTestId("fuel-cost")).not.toHaveTextContent(
      "national average",
    );
  });

  test("editing the mileage reruns the server's pure function client-side", () => {
    render(<FuelCost {...realPriceProps} />);
    const input = screen.getByLabelText(/miles driven per year/i);
    fireEvent.change(input, { target: { value: "24000" } });
    const expected = annualFuelCost({
      combinedMpg: 35,
      milesPerYear: 24_000,
      dollarsPerGallon: 4.15,
    })!;
    expect(screen.getByTestId("fuel-annual-cost")).toHaveTextContent(
      `$${expected.toLocaleString("en-US")}`,
    );
  });

  test("mileage is clamped to sane bounds; blur snaps the box to the committed value", () => {
    render(<FuelCost {...realPriceProps} />);
    const input = screen.getByLabelText(/miles driven per year/i);
    fireEvent.change(input, { target: { value: "200" } });
    const clamped = annualFuelCost({
      combinedMpg: 35,
      milesPerYear: 1_000,
      dollarsPerGallon: 4.15,
    })!;
    expect(screen.getByTestId("fuel-annual-cost")).toHaveTextContent(
      `$${clamped.toLocaleString("en-US")}`,
    );
    fireEvent.blur(input);
    expect(input).toHaveValue(1_000);
  });

  test("mid-edit emptiness keeps the last committed figure instead of flashing garbage", () => {
    render(<FuelCost {...realPriceProps} />);
    const input = screen.getByLabelText(/miles driven per year/i);
    const before = screen.getByTestId("fuel-annual-cost").textContent;
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("fuel-annual-cost").textContent).toBe(before);
  });
});
