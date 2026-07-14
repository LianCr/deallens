"use client";

/**
 * The lead form, progressively enhanced around one server action:
 *  - No JavaScript: plain form POST, server re-renders with the result
 *    (field errors or success), submitted values are echoed back.
 *  - With JavaScript: useActionState gives an optimistic pending state
 *    and inline field validation on blur — same action, one code path.
 *  - Zero CLS: every field owns a fixed-height error slot, so messages
 *    appear without moving anything.
 */
import { useActionState, useRef } from "react";
import { submitLead } from "./actions";
import { INITIAL_LEAD_STATE } from "./leadFormState";
import styles from "./page.module.css";

interface ContactFormProps {
  vehicleName: string | null;
}

const CLIENT_MESSAGES: Record<string, string> = {
  name: "Please tell the dealer your name.",
  email: "That email doesn't look right.",
  phone: "That phone number doesn't look right.",
};

export function ContactForm({ vehicleName }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitLead,
    INITIAL_LEAD_STATE,
  );
  const errorRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  // Instant field-level validation on blur — direct DOM writes into the
  // reserved error slots (no re-render, no layout shift).
  const validateField = (input: HTMLInputElement) => {
    const slot = errorRefs.current[input.name];
    if (!slot) return;
    slot.textContent =
      input.value.trim() !== "" || input.required
        ? input.checkValidity()
          ? ""
          : (CLIENT_MESSAGES[input.name] ?? "Please check this field.")
        : "";
  };

  if (state.status === "success") {
    return (
      <div className={styles.success} role="status">
        <h2 className={styles.successTitle}>Message sent ✓</h2>
        <p className={styles.successBody}>
          {state.values.name.split(" ")[0]}, the dealer will reply to{" "}
          <strong>{state.values.email}</strong>
          {vehicleName ? (
            <>
              {" "}
              about the <strong>{vehicleName}</strong>
            </>
          ) : null}
          .
        </p>
        <p className={styles.demoNote}>
          Demo scope: validation and this confirmation are real; no dealer
          was contacted, because there is no dealer backend.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate={false}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-name">
          Name
        </label>
        <input
          id="lead-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          defaultValue={state.values.name}
          className={styles.input}
          aria-invalid={state.errors.name ? true : undefined}
          onBlur={(e) => validateField(e.currentTarget)}
        />
        <p
          className={styles.fieldError}
          ref={(node) => {
            errorRefs.current.name = node;
          }}
          role="alert"
        >
          {state.errors.name}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-email">
          Email
        </label>
        <input
          id="lead-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.values.email}
          className={styles.input}
          aria-invalid={state.errors.email ? true : undefined}
          onBlur={(e) => validateField(e.currentTarget)}
        />
        <p
          className={styles.fieldError}
          ref={(node) => {
            errorRefs.current.email = node;
          }}
          role="alert"
        >
          {state.errors.email}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-phone">
          Phone <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="lead-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          pattern="[\d\s()+.\-]{7,20}"
          defaultValue={state.values.phone}
          className={styles.input}
          aria-invalid={state.errors.phone ? true : undefined}
          onBlur={(e) => validateField(e.currentTarget)}
        />
        <p
          className={styles.fieldError}
          ref={(node) => {
            errorRefs.current.phone = node;
          }}
          role="alert"
        >
          {state.errors.phone}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-message">
          Message <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="lead-message"
          name="message"
          rows={4}
          maxLength={1000}
          defaultValue={
            state.values.message ||
            (vehicleName
              ? `Hi — I'm interested in the ${vehicleName}. Is it still available?`
              : "")
          }
          className={styles.textarea}
          aria-invalid={state.errors.message ? true : undefined}
        />
        <p
          className={styles.fieldError}
          ref={(node) => {
            errorRefs.current.message = node;
          }}
          role="alert"
        >
          {state.errors.message}
        </p>
      </div>

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Sending…" : "Contact dealer"}
      </button>
    </form>
  );
}
