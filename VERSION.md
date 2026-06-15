# 3Dope Version Log

## v0.1.0-prototype

Saved: 2026-05-23 04:56 CAT

Baseline before Phase 1 production-hardening work.

Current capabilities:
- Premium R3F/Three.js viewer shell.
- STL, GLB, GLTF, OBJ, PLY, and FBX parser path.
- Scene list and selected asset state.
- Render modes, lighting presets, quality modes, and material controls.
- Basic edit controls for translate, rotate, scale, snap, and reset.

Known issues at checkpoint:
- Imported model visibility needs stronger diagnostics and camera fitting.
- Import feedback is not explicit enough.
- Runtime Three objects are stored directly in state.
- Editing is functional but not yet a true viewport gizmo system.

## v0.2.0-phase-1-hardening

Saved: 2026-05-23

Production-hardening pass after the prototype checkpoint.

Added:
- Import diagnostics for mesh count, triangles, vertices, bounds, and radius.
- Camera-fit requests after successful import.
- Orbit camera framing from imported model bounds.
- Import success/failure notices.
- Inspector diagnostics panel.

Known issues at checkpoint:
- Material editing is still global rather than per object.
- Undo/redo is not implemented.
- Scene management actions are still missing.

## v0.3.0-phase-2-3-editing-scene-management

Saved: 2026-05-23

Editing reliability and scene management pass.

Added:
- Per-object material state for base color, metalness, roughness, and opacity.
- Undo and redo stack for transform, material, visibility, and lock changes.
- Selected-object visibility and lock controls.
- Duplicate selected asset.
- Delete selected imported asset.
- Project JSON export for scene metadata, transforms, materials, render settings, diagnostics, and camera bookmarks.

Known limitations:
- Undo/redo currently covers non-destructive edit state, not deleted runtime geometry restoration.
- Project export stores scene metadata, not embedded model binary data.
- Viewport gizmo remains deferred until object lifecycle is separated from runtime Three objects.

## v0.4.0-phase-4-measurement-units

Saved: 2026-05-23

Measurement and unit workflow pass.

Added:
- Unit system selector for model units, mm, cm, m, and inches.
- Measurement capture for width, height, depth, diagonal, and radius.
- Measurement readouts in the inspector.
- Toggleable measurement overlay in the 3D scene.
- Dimension rails and labels derived from selected model bounds.
- Project export now includes unit and measurement state.

Known limitations:
- Measurements are currently bounds-based, not point-to-point picked measurements.
- Unit conversion assumes normalized model units map to meters unless the user selects a display unit.

## v0.5.0-phase-5-point-measurement

Saved: 2026-05-23

Point-to-point measurement pass.

Added:
- Point measurement mode for clicking two model surface points.
- World-space picked point storage.
- Point distance readout in the inspector.
- Scene markers, line, and distance label for picked points.
- Project export now includes point measurement mode and picked points.

Known limitations:
- Picked points are world-space hit points after current transforms, not semantic vertices/edges.
- Measurements do not yet snap to vertices, edges, or feature centers.

## v0.6.0-phase-6-section-slicing

Saved: 2026-05-23

Section analysis and non-destructive clipping pass.

Added:
- Section slicing controls with X/Y/Z axes.
- Invertible clipping direction.
- Live slice-plane offset slider.
- Renderer-level clipping plane path for imported and demo geometry.
- In-scene translucent guide plane and label for section orientation.
- Project export now includes clipping state.

Known limitations:
- This is visual clipping only; it does not yet generate capped cross-section faces.
- Slice offset is normalized to viewer space, not dynamically constrained to each imported model's bounds.

## v0.7.0-phase-7-viewport-gizmos

Saved: 2026-05-23

Direct manipulation pass for the editing system.

Added:
- Viewport transform gizmos for move, rotate, and scale.
- Snap-aware viewport transforms using the existing snap toggle.
- Orbit controls pause while a viewport gizmo is being dragged.
- Gizmo changes commit through the existing undo/redo transform stack.
- Selected-object transform readouts in the edit panel.
- Selection wireframe around imported geometry while edit mode is active.

Known limitations:
- Scale gizmo commits to uniform scale because the current transform model is uniform-only.
- Multi-object viewport selection is still deferred because the renderer currently stages one selected object at a time.

## v0.7.1-stl-import-hardening

Saved: 2026-06-13

STL reliability patch.

Fixed:
- STL imports now validate that parsed geometry contains real triangle positions before entering the scene.
- Binary STL fallback parser handles files with misleading `solid` headers or incorrect face counts.
- PLY imports now receive the same renderable-geometry validation before staging.
- Failed imports remain listed but no longer steal the active viewport selection.

Verified:
- Production build passes.
- ESLint passes.
- Loader smoke test passes for ASCII STL and binary STL with a misleading `solid` header.

## v0.7.2-large-stl-gpu-safety

Saved: 2026-06-13

Large STL crash-prevention patch.

Fixed:
- Binary STL files are now parsed through a bounded preview path instead of always allocating full GPU geometry.
- Large STL previews are decimated to a safe triangle budget before upload.
- Binary STL files with incorrect stored face counts are parsed from byte length when possible.
- Heavy imported meshes disable expensive shadow and post-processing passes to avoid black WebGL frames.
- Material creation no longer passes undefined transparency flags to Three.js.

Verified:
- Production build passes.
- ESLint passes.
- Loader smoke test passes for a 500k-triangle binary STL preview.
- Loader smoke test passes for a binary STL with both a misleading `solid` header and incorrect face count.

## v0.7.3-v1-prep-orientation-edit-recovery

Saved: 2026-06-14

V1-prep stability and packaging pass.

Fixed:
- Imported models now run through an auto-upright orientation pass before floor placement.
- CAD-style Z-up STL files are rotated upright when triangle normals indicate a clear floor.
- Normalization preserves the chosen orientation and then places the lowest bounds on the floor.
- Added manual Drop To Floor and Stand Upright controls for uncertain model orientation.
- Edit mode no longer wraps transform controls in the decorative Float wrapper.
- Removed the unstable Drei viewport TransformControls path from V1 edit mode after it caused render-loop crashes on rotate/scale.
- Replaced Drei's animated Grid material with a native Three grid helper to avoid reload-time uniform errors.
- Added a render error fallback so the app shell survives viewport render failures.
- Added WebGL context-loss notices and automatic quality reduction.
- Successful imports now report the orientation decision in Mesh Intelligence.

V1 packaging:
- Added `docs/V1_MAC_INSTALLER_PLAN.md`.
- Recommended Tauri 2 for the first Mac installer.
- Documented Apple Silicon build, DMG, signing, notarization, and release checklist.

Known limitations:
- Manual Stand Upright rotates in 90-degree X-axis increments; it is a recovery control, not semantic CAD orientation.
- V1 edit controls are sidebar-driven for stability; direct viewport gizmos should return through a custom controller or a validated dependency upgrade.
- Tauri scaffolding is not installed yet because signing identity, bundle ID, icon export, and installer ownership details are still external setup decisions.
