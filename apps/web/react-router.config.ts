import type { Config } from "@react-router/dev/config";
import { actionOrigins } from "./app/lib/action-origins";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  allowedActionOrigins: actionOrigins,
} satisfies Config;
