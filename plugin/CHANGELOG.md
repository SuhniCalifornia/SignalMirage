# SignalMirage Changelog

## v1.1.1

Refinement release focused on monochrome workflow clarity and final v1.1.1 cleanup.

### Changed
- Removed all four-color palette options from the active palette system.
- Kept only two-color palettes: Ghost + Dance and Midnight + Moon.
- Refined Dot Size to 10 subtle slider steps mapped to the old practical 1-4 range.
- Refined Grain Scale to 10 subtle slider steps.
- Simplified footer/status messages to avoid horizontal and vertical scrollbars.
- Preserved first-preview engine initialization so Atkinson renders correctly on first use.
- Updated manifest version to 1.1.1.

## v1.1.0

Refinement release focused on daily-use workflow and panel compactness.

### Added
- Dot Size control for larger or finer dither structure.
- Grain Scale control for finer or coarser surface contamination.
- Per-engine memory. Each dither engine remembers its last adjusted settings during the session.
- Reset Engine button to restore the selected engine to its default starting values.

### Changed
- Compact UXP panel layout.
- Removed Palette Mode dropdown. Palette color count is now handled automatically by the palette.
- Reorganized controls into Source, Tone, Structure, Surface, Edge, and Action sections.
- Edge Strength hides when Edge Character is set to Clean.
- Updated manifest version to 1.1.0.

## v1.0.0

Initial SignalMirage release.
