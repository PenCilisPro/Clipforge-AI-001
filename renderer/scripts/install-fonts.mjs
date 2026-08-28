// Downloads the font files used by the caption presets (see
// PRESET_STYLES in src/pages/ClipStudio.tsx: Inter, Bebas Neue,
// Montserrat) into renderer/assets/fonts/ during `npm install`.
//
// Why this exists: ffmpeg's drawtext filter normally resolves a font
// *family name* (font='Inter') through fontconfig, but the Railway
// container has no fontconfig setup at all ("Fontconfig error: Cannot
// load default config file"), so that always fails. Passing an actual
// font *file* via fontfile= sidesteps fontconfig entirely — this is the
// standard fix for drawtext in minimal/headless containers.
//
// Best-effort: if a download fails, we log a warning and continue: the
// render worker falls back to Inter.ttf (or, if that's also missing,
// back to font='Inter' via fontconfig, which will just fail the same way
// it does today rather than making anything worse).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, "..", "assets", "fonts");

const FONTS = [
  {
    name: "Inter.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
  },
  {
    name: "BebasNeue.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",
  },
  {
    name: "Montserrat.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
  },
];

async function main() {
  await mkdir(fontsDir, { recursive: true });

  for (const font of FONTS) {
    try {
      console.log(`[install-fonts] Downloading ${font.name}...`);

      const response = await fetch(font.url, { redirect: "follow" });

      if (!response.ok) {
        console.warn(
          `[install-fonts] ${font.name} failed (${response.status}), skipping.`,
        );
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path.join(fontsDir, font.name), bytes);

      console.log(
        `[install-fonts] Installed ${font.name} (${Math.round(
          bytes.length / 1024,
        )}KB)`,
      );
    } catch (error) {
      console.warn(
        `[install-fonts] ${font.name} failed, continuing:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

await main();
