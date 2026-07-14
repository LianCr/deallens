/** Shared shape between the lead-form server action and the client form. */
export interface LeadFormState {
  status: "idle" | "success" | "error";
  errors: Partial<Record<"name" | "email" | "phone" | "message", string>>;
  /** Submitted values, echoed back so a failed submit never eats input. */
  values: { name: string; email: string; phone: string; message: string };
}

export const INITIAL_LEAD_STATE: LeadFormState = {
  status: "idle",
  errors: {},
  values: { name: "", email: "", phone: "", message: "" },
};
