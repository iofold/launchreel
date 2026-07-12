import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 8-core box shared by 6 direction agents — be a good citizen by default.
Config.setConcurrency(2);
