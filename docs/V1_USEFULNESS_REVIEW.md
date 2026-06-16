# 3Dope V1 Usefulness Review

Saved: 2026-06-16

## Fixed In v0.7.4

- Separated automatic turntable rotation from saved object transforms.
- Hardened drag/drop event handling and enabled multi-file import from picker/drop.
- Made camera bookmarks capture and restore real camera views.
- Added a visible presentation-mode exit control.
- Replaced the inert Smart Suggest button with contextual inspection guidance.

## Highest-Value Next Fixes

1. Project save/load
   - Why: Users need to reopen work, not just export metadata.
   - Approach: Save a `.3dope` JSON manifest plus embedded or referenced model files.
   - Complexity: Medium.

2. Screenshot export
   - Why: A viewer becomes useful when users can create presentation images.
   - Approach: Add canvas capture for PNG with transparent-background option.
   - Complexity: Low to medium.

3. Import queue panel
   - Why: Multi-file drag/drop needs visible progress, success, and failure per file.
   - Approach: Track import jobs with status, error, and selected result.
   - Complexity: Medium.

4. Real model bounds after user transforms
   - Why: Measurement and camera fit should reflect rotated/scaled objects.
   - Approach: Derive transformed bounds from scene object plus object transform.
   - Complexity: Medium.

5. Direct manipulation controls
   - Why: Sidebar controls are stable but not fast enough for creative editing.
   - Approach: Build a small custom transform overlay or upgrade/test Drei/Three before restoring viewport gizmos.
   - Complexity: High.

## Avoid For V1

- Mesh-level editing.
- Boolean CAD operations.
- Cloud collaboration.
- AI microservices.
- Video export.
- STEP/USDZ/BLEND native conversion unless a proven local conversion path is selected.

## V1 Definition Of Useful

- Import STL/GLB/OBJ/PLY/FBX reliably without black screens.
- Auto-frame, auto-floor, and recover from orientation mistakes.
- Basic move/rotate/scale with undo/redo.
- Measurements and section slicing that reflect user-visible object state.
- Material tweaks and render modes that remain stable on large models.
- Screenshot export.
- Project save/load.
- Signed macOS app bundle and DMG.
