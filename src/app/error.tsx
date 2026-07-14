"use client";

/**
 * Last-resort error boundary. If something upstream genuinely breaks,
 * say so honestly instead of showing Next's raw 500 page.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: "34rem", margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        Something broke on our side
      </h1>
      <p style={{ color: "var(--color-muted)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
        Probably an upstream data source having a moment. Nothing you did —
        try again, or start over from the picker.
      </p>
      <button
        onClick={reset}
        style={{
          height: "2.75rem",
          padding: "0 1.5rem",
          font: "inherit",
          fontWeight: 600,
          color: "var(--color-bg)",
          background: "var(--color-fg)",
          border: "1px solid var(--color-fg)",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
