import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { paper:"var(--paper)",panel:"var(--panel)",ink:"var(--ink)",muted:"var(--muted)",
      line:"var(--line)",steel:"var(--steel)","steel-soft":"var(--steel-soft)",mark:"var(--mark)",
      danger:"var(--danger)",ok:"var(--ok)" },
    fontFamily: { sans:['"IBM Plex Sans"',"system-ui","sans-serif"], serif:['"Source Serif 4"',"Georgia","serif"] },
  }},
} satisfies Config;
