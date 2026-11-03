# Orbit Playground and demo film

Local Swagger UI with missions, a colorful mix of HTTP methods, 230 operations and linked schemas. Responses are synthetic, no production services are used.

```bash
npm ci
npm run demo
```

Open http://localhost:4177/docs with the unpacked extension enabled. `/reference` is available for demonstrating custom site rules. All state is disposable.

The film uses actual Chromium captures of the extension, English captions and the original 80 BPM lofi score "Quiet Orbit". Output is 1920x1080, 30 fps, approximately 72 seconds. Source frames, music and final MP4 are written to the directory selected with `DEMO_OUTPUT`.

Design: Avenir Next for film titles, native Swagger typography in the recording. A fast paper-to-ink opening, a dark background, and Swagger's blue, green, orange and red. A quiet browser frame keeps the API readable, transitions and the score carry the rhythm. No production API data or user browser profile is recorded.

Capture uses Retina PNG frames without a lossy WebM intermediate. Camera crops happen before the final downscale. The cursor follows the recorded pointer events at 30 fps. The closing mascot uses the extension's actual SVG and CSS hop, rendered frame by frame.

The demo and production scripts are development assets. Do not include `demo/` in a store upload.

To reproduce the film, start the demo server, install Python packages `numpy`, `scipy`, `Pillow` and `imageio-ffmpeg`, then run:

```bash
export DEMO_OUTPUT=/tmp/swagger-enhancer-film
npm run demo:record
node demo/film-assets.cjs
python3 demo/score.py
python3 demo/verify-captures.py
python3 demo/render.py
```

`DEMO_SCENES=preview,sites` records selected chapters again. The production fonts are macOS Avenir Next and SF Mono. `DEMO_FFMPEG` can point to an existing FFmpeg executable.

The current export is `swagger-enhancer-demo-v3.mp4`, with `quiet-orbit.mp3`, `cover-v3.png` and `contact-sheet-v3.jpg`. Music and titles can be rebuilt without recording the browser again.

To refresh the five README GIFs from the same lossless captures:

```bash
python3 demo/gifs.py
```

The loops are 800x450, about 7-9 seconds each, and replace the files in `docs/`. Use `--dest /tmp/readme-gifs` to review candidates first, or `--posters` to inspect three frames per demo before encoding.
