# 260308_DifferentialGrowth

260308_DifferentialGrowth is a Three.js-based interactive 3D differential growth simulator. It includes a draggable control panel, base shape selection, curvature-gradient shading, and mask painting tools that let you block growth in selected mesh regions and preview the mask in grayscale mode.

## Features
- Real-time differential growth simulation on triangle meshes
- Adaptive edge splitting/remeshing with max-vertex cap enforcement
- Base shape selection: `Cube`, `Sphere`, `Torus`
- Shape `Subdivision` slider for denser starting meshes and smoother growth
- Draggable/collapsible UI panel with grouped settings:
  - `Simulation` (Start/Stop, Mask mode, Reset, Growth Speed, Seed)
  - `Shape` (base shape, brush radius, falloff offset, blur mask controls)
  - `Growth` (growth step, edge target, split threshold, repulsion, smoothing, shape retention, max vertices)
  - `Materials` (gradient start/end colors, curvature and shading controls, bloom, exposure)
- Mask painting mode:
  - `Mask` button pauses simulation and switches shader to grayscale mask preview
  - Left-click paint applies black core with smooth falloff ring (paused mask mode only)
  - `Start` resumes simulation and restores curvature-based shading
- Postprocessing pipeline with bloom and FXAA

## Getting Started
1. Clone this repository.
2. Install dependencies:
   - `npm install`
3. Run development server:
   - `npm run dev`
4. Build production bundle:
   - `npm run build`
5. Run tests:
   - `npm test`

## Controls
- Camera:
  - `Wheel` = Zoom
  - `MMB` = Pan
  - `RMB` = Orbit
- Painting:
  - Click `Mask` to enter mask mode (auto-pauses simulation)
  - `LMB` on mesh paints growth-blocking mask
- Simulation:
  - `Start` runs simulation and exits mask visualization
  - `Stop` pauses simulation
  - `Reset` rebuilds the selected start shape and clears the mask
