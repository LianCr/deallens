import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 999,
            border: "10px solid #0d7a6f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
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
