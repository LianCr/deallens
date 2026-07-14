import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PickerForm } from "./PickerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const baseProps = {
  makes: ["Honda", "Toyota"],
  years: [2026, 2025, 2022],
  models: [] as string[],
  selection: { make: "", year: "", model: "", quote: "" },
  modelsError: null,
  vinError: null,
};

describe("PickerForm", () => {
  test("is a plain GET form — the no-JS fallback is structural, not accidental", () => {
    render(<PickerForm {...baseProps} />);
    const form = screen.getByRole("form", { name: /pick a vehicle/i });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/");
  });

  test("model select stays disabled (with guidance) until make and year are picked", () => {
    render(<PickerForm {...baseProps} />);
    const model = screen.getByRole("combobox", { name: /model/i });
    expect(model).toBeDisabled();
    expect(
      screen.getByRole("option", { name: /pick make and year first/i }),
    ).toBeInTheDocument();
  });

  test("model select opens up once models arrive from the server", () => {
    render(
      <PickerForm
        {...baseProps}
        selection={{ make: "Honda", year: "2022", model: "", quote: "" }}
        models={["Accord", "Civic"]}
      />,
    );
    const model = screen.getByRole("combobox", { name: /model/i });
    expect(model).toBeEnabled();
    expect(screen.getByRole("option", { name: "Civic" })).toBeInTheDocument();
  });

  test("catalog failure renders an honest, visible error", () => {
    render(
      <PickerForm
        {...baseProps}
        modelsError="Couldn't reach the vehicle catalog (NHTSA). Try again in a moment."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach/i);
  });

  test("VIN errors surface next to the VIN form", () => {
    render(<PickerForm {...baseProps} vinError="That VIN doesn't identify a vehicle." />);
    expect(screen.getByRole("alert")).toHaveTextContent(/vin/i);
  });
});
