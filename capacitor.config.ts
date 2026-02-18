import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "kr.reviewlab.app",
  appName: "리뷰랩",
  webDir: "public",
  server: {
    url: "https://www.reviewlab.kr",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

