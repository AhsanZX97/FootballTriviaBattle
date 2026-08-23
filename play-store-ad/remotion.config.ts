import { Config } from '@remotion/cli/config';

// Pixel art everywhere: nearest-neighbour scaling, never a blurred sprite.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
