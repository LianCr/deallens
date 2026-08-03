import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: asphalt tile with a teal "lens" mark. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1d21",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "2.5px solid #0d7a6f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#c47a1a",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
