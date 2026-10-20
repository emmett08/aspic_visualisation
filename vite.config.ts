import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { solverPlugin } from "./server/solver-plugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const solverEnabled = env.ASPIC_SOLVER === "1";
  return {
    plugins: [vue(), solverPlugin({
      enabled: solverEnabled,
      executable: env.ASPIC_SOLVER_EXECUTABLE,
      limitsFile: env.EAL_LIMITS_FILE || undefined,
    })],
    base: "./",
    define: { __ASPIC_SOLVER_ENABLED__: JSON.stringify(solverEnabled) },
    server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  };
});
