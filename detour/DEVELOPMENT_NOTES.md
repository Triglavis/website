# Detour Landing Page - Development Notes

## Current Version: v1.0 (Prototype)
**Date:** January 26, 2025

### Completed Features

#### Landing Page Structure
- Fullscreen car game as hero section
- Complete landing page with all sections (problem, solution, features, how it works, privacy, support)
- Responsive design with mobile support
- Dark mode support throughout

#### Car Game Mechanics
- **Story Flow**: 
  - Opening narrative about saved content
  - Introduction to "Browser Country"
  - Progressive difficulty with collisions
  - Detour power-up activation
  - Star mode for invincibility
  
- **Visual Features**:
  - Fullscreen canvas (white in light mode, #333 in dark)
  - Browser Country zone with visual boundaries
  - Wobbling obstacles (YouTube, Twitter, Reddit, etc.)
  - Skid marks and particle effects
  - Star mode golden glow and trail effects
  
- **Controls**:
  - Desktop: Arrow keys/WASD + H for honk + ESC to skip
  - Mobile: Steering wheel + gas/brake pedals + horn button
  - Prevented keyboard scrolling for better game experience
  
- **Audio**:
  - Dynamic engine sounds with wobble in Browser Country
  - Collision sounds
  - Honk feature
  - Power-up activation sound
  - Mute button

#### Game States
1. **Intro**: Story sequence explaining the journey
2. **Exploring**: Free driving toward content
3. **Browser Country**: Wobbly controls, obstacles appear
4. **Struggle**: After 3 collisions
5. **Detour Available**: Power-up appears after 5 collisions
6. **Star Mode**: Invincible with Detour activated
7. **Won**: Reached content successfully

### Technical Implementation
- Pure vanilla JavaScript with no dependencies
- Web Audio API for dynamic sound generation
- Canvas-based rendering with requestAnimationFrame
- Responsive design that works on all devices
- Performance optimized with particle pooling

### Known Areas for Future Iteration
- Actual Chrome extension ID needs to be added
- Demo GIF/video could be created
- Feature icons are currently emoji (could be custom SVGs)
- LemonSqueezy support link needs updating

---

## Iteration Notes

### v1.1 - Layout Improvements (Jan 26, 2025)
**Changes Made:**
- Updated both `.car-game-container` and `.hero` to use `100dvh` and `100dvw` for full viewport coverage
- Stacked containers on top of each other using `position: fixed`
- Removed background from `carGameContainer` to make it transparent
- Canvas now uses `clearRect` instead of filling with background color
- Added hero spacer div to maintain scroll space when hero is visible
- Updated skip/win transitions to properly handle the new stacked layout

**Technical Notes:**
- Using `dvh/dvw` units instead of `vh/vw` for better mobile viewport handling
- Hero section has background color while game container is transparent
- Z-index: game container (1000) > hero section (1) to ensure game is on top

### v1.2 - Hero as Game Background (Jan 26, 2025)
**Changes Made:**
- Hero section is now visible from start as the game background
- Removed story overlay functionality - hero provides the context
- Game starts directly in 'exploring' mode (skipped 'intro' state)
- Updated transitions to just hide game container (hero already visible)
- Added CSS to make hero non-interactive while game is playing
- Removed story sequence code and browser country overlay messages

**Design Decision:**
- Using the Detour branding (logo, title, tagline) as the game background creates a stronger connection between the game metaphor and the product
- Players see what they're working towards while playing the game

### v1.3 - Scrolling Fix (Jan 26, 2025)
**Issue Fixed:**
- Hero section was scrolling during gameplay, causing visual issues

**Changes Made:**
- Added `body.game-active` class to lock scrolling during game
- JavaScript adds class on init, removes on skip/win
- Hero section changes from fixed to relative positioning when game ends
- Removed unnecessary hero-spacer div

**Technical Implementation:**
- Using `position: fixed` and `overflow: hidden` on body during game
- Hero transitions from fixed overlay to normal scrollable section
- Smooth transition maintains visual continuity

### v1.4 - Advanced Physics & Swamp Mechanics (Jan 27, 2025)
**Major Gameplay Overhaul:**
- Controls are now relative to car direction (W = forward from car's perspective)
- Browser Country transformed into a sticky swamp with progressive difficulty

**New Physics Features:**
1. **Suspension & Lean**:
   - Car leans based on turning forces and inertia
   - Suspension creates vertical movement on acceleration
   - Visual tilt adds realism to cornering

2. **Transmission System**:
   - 5-speed automatic transmission with gear ratios
   - RPM-based engine sounds
   - Realistic acceleration curves

3. **Advanced Braking**:
   - Brake lock at high speeds (ABS simulation)
   - Visual brake light flashing when locked
   - Reduced effectiveness during lock

4. **Swamp Mechanics**:
   - Progressive drag the deeper you go
   - Rubber bands attach randomly to car
   - Bands stretch and break with physics
   - Visual elastic connections
   - More bands = more resistance

**Visual Enhancements:**
- Headlights when moving forward
- Speed/gear indicators
- Rubber band counter
- Gradient swamp effect with texture
- Enhanced car shadow based on lean

### v1.5 - Race Track Reimplementation (Jan 27, 2025)
**Complete Overhaul of Browser Country:**
- Transformed from sticky swamp to endless race track
- No exit design - perfect metaphor for distraction loops

**Track Features:**
1. **Track Design**:
   - Low-poly monochromatic aesthetic
   - Multiple segment types: straights, turns, chicanes, jumps
   - Visible "NO EXIT" barrier at the end
   - Track surface with edge lines and center dashes

2. **Jump Mechanics**:
   - Ramps launch car into air based on speed
   - Gravity and landing physics
   - Shadow shrinks when airborne
   - Speed loss on hard landings

3. **Visual Elements**:
   - Distraction signs (YouTube, Twitter, etc.) pointing away
   - Traffic cones and barriers as decorations
   - Racing stripes on car
   - Lap counter showing endless loops

4. **Gameplay Change**:
   - After 3 laps of no escape, Detour power-up appears
   - Message: "Welcome to the endless loop! Where's the exit?"
   - Emphasizes the futility of distraction sites

**Technical Improvements:**
- Dynamic track generation system
- Segment-based track layout
- Jump detection based on track position
- Enhanced airborne physics

### v1.6 - Isometric Pixel Art Transformation (Jan 27, 2025)
**Complete Visual Overhaul:**
- Transformed to isometric perspective (30° angle)
- Black and white only, pixelated minimal style
- 4x pixel scaling for crisp retro aesthetic

**Isometric Implementation:**
1. **World to Screen Conversion**:
   - All game objects converted to isometric coordinates
   - Proper depth sorting (back to front rendering)
   - Z-axis support for jumps and elevation

2. **Visual Style**:
   - Monochrome palette (pure black and white)
   - Pixel-perfect rendering with image smoothing disabled
   - Minimalist geometric shapes
   - Grid-based world layout

3. **Track Redesign**:
   - Isometric tiles for track surface
   - 3D barriers and walls with alternating patterns
   - Simplified signs and decorations
   - Height-based jump ramps

4. **Car Rendering**:
   - Simple isometric box with rotation
   - 3D sides visible based on angle
   - Shadow that scales with jump height
   - Single white pixel for windshield

**Technical Details:**
- Canvas scaling for pixel-perfect rendering
- Isometric grid as visual reference
- All coordinates in world space, converted for display
- Consistent monospace font for UI

### Next Steps Discussed:
- Make other information sections "extremely minimal like the hero page"

### User Feedback:
- [Will be added as received]

### Technical Debt:
- [Will track any shortcuts taken]

### Ideas for Enhancement:
- [Will collect ideas as they come up]