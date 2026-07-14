"use server";

/**
 * Lead-form server action. Progressive enhancement comes free with
 * form actions: without JavaScript the browser posts the form and the
 * server re-renders the page with this state; with JavaScript,
 * useActionState drives pending/optimistic UI from the same function.
 *
 * Demo scope: validation and success are real, delivery is not — this
 * demo has no dealer backend, and the UI says so (honesty rule).
 */
import type { LeadFormState } from "./leadFormState";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+.-]{7,20}$/;

export async function submitLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
  };

  const errors: LeadFormState["errors"] = {};
  if (!values.name) errors.name = "Please tell the dealer your name.";
  if (!values.email) errors.email = "An email is required for the reply.";
  else if (!EMAIL_RE.test(values.email)) errors.email = "That email doesn't look right.";
  if (values.phone && !PHONE_RE.test(values.phone)) {
    errors.phone = "That phone number doesn't look right.";
  }
  if (values.message.length > 1000) {
    errors.message = "Please keep the message under 1,000 characters.";
  }

  if (Object.keys(errors).length > 0) {
    return { status: "error", errors, values };
  }

  // A real integration would enqueue the lead here (CRM, email, etc.).
  return { status: "success", errors: {}, values };
}
