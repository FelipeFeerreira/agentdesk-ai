import { ImageResponse } from "next/og";

export const alt = "AgentDesk AI — AI Customer Support & Sales Automation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #20203d 0%, #4f4fae 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, opacity: 0.85 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "white", display: "flex" }} />
          AgentDesk AI
        </div>
        <div style={{ marginTop: 28, fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          AI agents that actually work with your business
        </div>
        <div style={{ marginTop: 24, fontSize: 30, opacity: 0.85, maxWidth: 900 }}>
          Customer support, lead qualification and automation connected to real data, tools and workflows.
        </div>
      </div>
    ),
    { ...size },
  );
}
