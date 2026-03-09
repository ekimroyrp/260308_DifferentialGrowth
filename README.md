# 260308_DifferentialGrowth

260308_DifferentialGrowth is a Three.js-based interactive 3D differential growth simulator with adaptive remeshing, mask-driven growth control, timeline scrubbing, history undo/redo, and mesh/screenshot export tools. It includes a draggable/collapsible control panel, multiple procedural start shapes, and gradient shading modes for both curvature and displacement.

## Features
- Real-time differential growth simulation on triangle meshes with adaptive loop behavior (split -> grow/repulse -> relax).
- Adaptive edge splitting/remeshing with max-vertex cap enforcement to support growing surface detail.
- Expanded base shape library: `Sphere`, `Quad Sphere`, `Polyhedron`, `Cube`, `Rounded Cube`, `Torus`, `Pyramid`, `Cone`, `Cylinder`.
- Shape setup controls: `Start Subdivision`, `Scale X/Y/Z`, `Rotate X/Y/Z`, `Transform Order`, `Reset Subdivision`, `Reset Transform`.
- Simulation controls: `Start/Pause`, `Reset`, `Simulation Rate`, and `Simulation Timeline` scrubbing (resume continues from scrubbed step).
- Global editing history with up to 100 undo and 100 redo states across sliders, toggles, dropdowns, action buttons, and mask paint/erase strokes.
- Dedicated `Mask` section with `Enter/Exit Mask Mode`, brush radius/falloff, `Blur Mask`, and `Clear Mask`.
- Mask mode visualization uses lit grayscale shading plus forced wireframe for better surface readability while painting.
- Material controls: `Gradient Type` (`Displacement` or `Curvature`), gradient colors, `Gradient Contrast`, `Gradient Bias`, `Gradient Blur`, `Fresnel`, `Specular`, and `Bloom`.
- Export section with `Export OBJ` and `Export GLB` (both including baked per-vertex colors from the current visualization state), plus `Export Screenshot` (PNG capture of the current viewport).
- Draggable/collapsible UI with collapsible sections and custom-styled dropdown controls.
- Post-processing pipeline with bloom and FXAA.

## Getting Started
1. Clone this repository.
2. Install dependencies:
   - `npm install`
3. Run development server:
   - `npm run dev`
4. Build production bundle:
   - `npm run build`
5. Preview production build locally:
   - `npm run preview`
6. Run tests:
   - `npm test`

## Controls
- Camera:
  - `Wheel` = Zoom
  - `MMB` = Pan
  - `RMB` = Orbit
- Simulation:
  - `Start` runs simulation
  - `Pause` stops simulation updates and enables timeline scrubbing
  - `Reset` rebuilds the current shape setup and resets timeline history to step 0
  - `Simulation Timeline` lets you scrub through recorded steps while paused; pressing `Start` resumes from the selected step
  - `Ctrl + Z` = Undo (up to 100 steps), `Ctrl + Y` or `Ctrl + Shift + Z` = Redo (up to 100 steps)
- Painting:
  - Click `Enter Mask Mode` to pause simulation and switch to mask visualization
  - `LMB` paints mask, `Shift + LMB` erases mask
  - `Blur Mask` smooths mask gradients, `Clear Mask` removes current mask
  - `Exit Mask Mode` (or `Start`) returns to regular shader view
- Shape:
  - Use base shape/dropdowns/sliders to configure initial topology and transforms before or between runs
  - `Show Mesh` toggles shaded mesh visibility, `Show Wireframe` toggles wire overlay (wireframe is forced on in mask mode)
- Export:
  - `Export OBJ` downloads an OBJ with vertex colors
  - `Export GLB` downloads a GLB with vertex colors
  - `Export Screenshot` downloads a PNG screenshot of the current viewport

## Deployment
- **Local production preview:** `npm install`, then `npm run build` followed by `npm run preview` to inspect the compiled bundle.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree/clone, copy everything inside `dist/` plus a `.nojekyll` marker to its root (and keep the minimal deploy layout such as `assets/`, `env/`, and `index.html`), commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/260308_DifferentialGrowth/
