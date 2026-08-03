import { ImageResponse } from "next/og";

export const alt = "DealLens — Is this price fair?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share-card art for deal links and the home page. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(145deg, #1a1d21 0%, #2a3038 55%, #1f3d38 100%)",
          color: "#f3f1ec",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "4px solid #0d7a6f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#c47a1a",
              }}
            />
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>
            DealLens
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            Is this price fair?
          </div>
          <div style={{ fontSize: 28, color: "#8b939e", maxWidth: 820, lineHeight: 1.35 }}>
            Pricing as context, not a number — market distribution, 24-month
            history, and honest data labels.
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#0d7a6f", fontWeight: 600 }}>
          deallens-xi.vercel.app
        </div>
      </div>
    ),
    { ...size },
  );
}
