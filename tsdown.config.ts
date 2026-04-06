import { defineConfig, type UserConfig } from "tsdown";

const buildConfig: UserConfig = defineConfig({
	entry: ["./src/qrc_codec.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
});

export default buildConfig;
