import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(null); // auto (one thread per core)
Config.setChromiumOpenGlRenderer("angle");
Config.overrideWebpackConfig((config) => config);
