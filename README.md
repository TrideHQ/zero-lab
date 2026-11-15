# 0⁰ Lab

**Every science topic, in 3D — for students everywhere. Then do the practical with your own hands.**

A holographic science library. Pick a topic, explore it as a 3D hologram with short cards and diagrams, then opt in to the practical: do the experiment by hand on a hologram bench while an AI lab partner comments on your readings, and get an exam-style mark computed in code.

One codebase runs in three modes:

| Mode | Devices | Input |
|---|---|---|
| Browser 3D (default) | phones, laptops | touch, mouse |
| AR | Android phones (WebXR `immersive-ar`, hit-test, DOM overlay) | touch |
| VR / MR | Meta Quest, Meta VR Glasses (WebXR `immersive-vr`, hand tracking) | hands only, seated |

## What is in the MVP

- **10 physics topics**: simple pendulum, Hooke's law, moments, reflection, refraction, lenses, total internal reflection, Ohm's law, series and parallel resistors, gravitation and free fall.
- **Moon & Astronauts**: hammer and feather, pendulum on the Moon, laser to the Moon, phases of the Moon.
- **3 practicals**: pendulum → g (Earth or Moon), glass block → n, Ohm's law → R.
- **12 curricula**: International (default), Cambridge IGCSE, Cambridge A-Level, UK GCSE, AP Physics 1/2, IB DP, NGSS, CBSE, WAEC/NECO, KCSE, CAPS, Australian Curriculum. The physics is the same; topic names, levels, grouping and the practical rubric change.
- **8 locales**: English complete; fr, es, pt, ar (right-to-left), hi, sw, zh are partial machine drafts that fall back to English.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (fit, marking, issue detection, partner validation)
npm run build        # validates all content first; invalid content fails the build
npm start            # serves dist/ and /api/partner on PORT (default 8011)
```

The lab partner needs `LLM_API_KEY` on the server (plus optional `LLM_BASE_URL`, default `https://api.cerebras.ai/v1`, and `LLM_MODEL`, default `gpt-oss-120b`). With no key, or if the call fails or takes longer than 2.5 s, the rule-based partner answers instead. The key never reaches the browser.

Useful URL switches: `?board=ap`, `?lang=fr`, `?lite=1`, `?partner=rules`, and in dev `?iwer=glasses|quest3|phone` to emulate a headset.

## How it is built

- **Topics are data.** `content/<subject>/<slug>.json`, validated against `content/schema.json`. Each card's `modelState` drives the 3D model. `curricula` maps the topic to each board's own topic name and level (`null` when a board does not list it).
- **Templates** (`src/templates/*`): `ray-optics`, `circuit-board`, `forces-rig`, `sky-moon`. Each exposes state, named parts for "point at" checks, drag handles, controls, and renders its own diagrams.
- **Practicals** (`practicals/*.json` + `src/practicals`): the engine holds readings, derives the table, fits the line by least squares and detects issues. `marks.ts` computes every mark from `practicals/rubric.json`.
- **Lab partner** (`src/partner`, `api/`): the server receives numbers and issue codes only, never names or free text. The model's reply is validated: fixed tip list, no marks, and any number it writes must already be in the context. Otherwise the rules answer.
- **XR** (`src/xr`): pinch + ray panels and direct handle grabbing for headsets; hit-test placement with the normal HTML UI for phone AR.

## Checks

```bash
node scripts/practical-check.mjs   # each practical end to end in a browser, plus one bad reading each
node scripts/xr-check.mjs          # hands-only run in the Meta VR Glasses and Quest 3 emulator profiles
node scripts/render-diagrams.ts    # pre-render diagrams to public/img/gen
node scripts/draft-topic.ts <slug> "<Title>"   # LLM first draft, always saved as reviewed:false
```

## Known limits

- Not yet run on a physical Quest, VR Glasses or Android phone: XR was tested in the IWER emulator only, so frame rate on devices is unmeasured and AR hit-testing on a real surface is unverified.
- Every topic is `reviewed: false` and every curriculum mapping is `verified: false` until a teacher checks them. The Draft badge shows on all of them.
- Circuit components snap to fixed places and wires appear automatically; free wiring is not built.
- No narration audio is shipped yet (`scripts/render-vo.sh` is the hook); card text is always on screen.
- Textures are procedural, so there is no KTX2 pipeline.

See `CREDITS.md` for third-party software and content notes.
