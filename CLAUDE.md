# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Triglavis is a minimal, modern static website featuring an interactive canvas-based grid animation. The site displays the Triglavis logo with sophisticated visual effects and user interactions.

## Architecture

### Core Components
- **index.html**: Main entry point, minimal HTML structure
- **canvas-grid.js**: Primary interactive canvas animation system
  - Renders a grid of "∴" symbols using HTML5 Canvas
  - Implements mouse hover effects, press/hold interactions, and wave animations
  - Supports mobile touch interactions
  - Features elastic physics for logo movement when dragged
  - Automatically adapts to light/dark mode
- **grid.js**: Alternative grid implementation (currently not in use)
- **styles.css**: Minimal styling using CSS custom properties for theming

### Key Features
1. **Interactive Canvas Grid**: Dynamic grid of symbols that respond to user interactions
2. **Logo Interactions**: Press, hold, and drag interactions with spring physics
3. **Wave Effects**: Ripple effects emanating from interactions
4. **Dark Mode Support**: Automatic adaptation to system color scheme
5. **Mobile Optimized**: Touch-friendly interactions and responsive design

## Development Commands

This is a static website with no build process. To develop:

1. **Run locally**: Open `index.html` directly in a browser or use a local server:
   ```bash
   python -m http.server 8000
   # or
   npx serve
   ```

2. **Testing**: No automated tests currently. Manual testing in browsers.

3. **Deployment**: Static files are deployed directly (appears to use Netlify based on `_headers` and `_redirects`)

## File Structure Patterns

- **Static Assets**: All files are served directly
- **No Build Process**: No bundling, transpilation, or preprocessing
- **Netlify Configuration**: `_headers` for security headers, `_redirects` for routing
- **Analytics**: Cloudflare Web Analytics integrated

## Important Implementation Details

### Canvas Animation System (canvas-grid.js)
- Uses requestAnimationFrame for smooth 60fps animations
- Pre-renders symbols to offscreen canvases for performance
- Implements spatial indexing for efficient collision detection
- Uses Float32Array for intensity calculations to optimize memory usage

### Interaction Design
- **Mouse Hover**: Creates a radial intensity field around cursor
- **Logo Press**: Depression effect with power buildup over time
- **Logo Drag**: Elastic band physics from viewport corners
- **Wave Generation**: Triggered on release with properties based on interaction type

### Performance Considerations
- Symbol caching to avoid repeated text rendering
- Batch drawing operations in single canvas pass
- Debounced resize handlers
- Early exit conditions for animation loops

## Code Style Guidelines

- **IIFE Pattern**: All JavaScript wrapped in immediately invoked function expressions
- **No Dependencies**: Pure vanilla JavaScript, no frameworks or libraries
- **Event Handling**: Defensive programming with preventDefault() and proper cleanup
- **Mobile First**: Touch events handled alongside mouse events

## Detour Chrome Extension Landing Page

### /detour Directory
Contains the Detour Chrome extension landing page with an interactive car mini-game.

#### Core Game File: `/detour/car-game-mac-3d.js`
A sophisticated 3D car physics simulation built with Three.js featuring:

##### Visual Style
- **Macintosh monochrome aesthetic**: Black and white only
- **45x45px car size** with 3D graphics using orthographic camera
- **Retro styling** inspired by classic Mac applications

##### Physics Engine
Built from the ground up with realistic automotive physics:

**Newton's Laws Implementation:**
- F = ma for acceleration calculations
- Individual tire physics with proper force distribution
- Mass: 1000kg, Moment of Inertia: 1666 kg⋅m²
- Gravity: 9.81 m/s² affecting vertical motion

**Transmission System:**
- Manual transmission simulation with gear ratios [3.5, 2.0, 1.4, 1.0, -3.5]
- Engine: 40kW (53hp), Max RPM: 6000, Max Torque: 250Nm
- Reverse gear with stop detection and 0.2s engagement delay
- Auto-shift from reverse to 1st gear when pressing W

**Individual Tire Physics:**
- Each tire has independent ground contact detection
- Spring-damper suspension system (40000 N/m stiffness, 3000 Ns/m damping)
- Weight distribution affects tire grip and traction
- Speed-dependent steering limitation for realistic handling
- Tire traction calculations for acceleration/braking/cornering

**Realistic Forces:**
- Power-limited engine force (P = F × v)
- Aerodynamic drag (F = ½ρCdAv²)
- Rolling resistance proportional to weight
- Brake force: 24000N (3x stronger than initial implementation)

##### Ground Contact System
**Individual Tire Detection:**
- Platform boundaries: Left (-27.5 to -7.5), Right (7.5 to 27.5), Length: 500 units
- Each tire independently checks ground contact
- Forces only apply when tires touch surfaces

**Realistic Free Fall Physics:**
- No engine force when airborne
- No brake force when airborne  
- No steering input when airborne
- No skid marks in free fall
- Only gravity (9.81 m/s²) and existing momentum affect trajectory

##### Car Tumbling System
**Gravity-Based Orientation:**
- Front tires off ground → nose dips down (pitch forward)
- Rear tires off ground → tail dips, nose up
- Speed-based angular momentum for realistic tumbling
- Pitch rotation limits: -90° to +90°

##### Audio System (Web Audio API)
**3D Spatial Audio:**
- HRTF-based positioning for realistic sound placement
- Distance-based volume attenuation

**Engine Sound (2-Stroke Simulation):**
- Triangle wave for cutesy 2-stroke character
- Frequency: (RPM/60) × 2 × 2 (2-stroke + pitch adjustment)
- Volume: 15% idle, up to 45% at speed
- 5% frequency modulation at 15Hz for engine irregularity

**Impact Sounds:**
- Dull thud: 60Hz→30Hz triangle wave, 0.8 volume
- Positioned at exact impact location (wall surface or obstacle center)

**Horn Sound:**
- 800Hz triangle wave, 100% volume
- Positioned 1.2m in front of car, follows car rotation

**Gear Change Sound:**
- 80Hz→60Hz triangle wave, 0.5 volume, 0.15s duration

##### Visual Elements
**Car Model (Three.js):**
- Black body with white windshield
- White hubcaps with 4 spokes (positioned outward from wheels)
- Brake lights: Black→White when braking or stationary >1s
- Positioned at rear corners (-0.4, +0.4), facing backward

**Environment:**
- Two gray platforms (20×500 units) separated by 15-unit chasm
- Platform length prevents jumping between them
- Black perimeter walls for collision boundaries
- Random black obstacles for navigation challenge

**Visual Effects:**
- Skid marks for each tire (only when on ground)
- Color inversion flash on obstacle collision
- Wheel rotation shows actual angular velocity

##### Controls
- **W/↑**: Forward throttle (auto-shifts from reverse to 1st)
- **S/↓**: Brake (forward gears) or Reverse throttle
- **A/←, D/→**: Steering (max 45° front wheels)
- **Space**: Handbrake
- **H**: Horn
- **M**: Mute toggle

##### Game Mechanics
**Brake Light Logic:**
- Active braking (S key)
- Handbrake engaged (Space)
- Stationary for 1+ seconds (realistic traffic behavior)

**Skid Mark System:**
- High-intensity marks during wheel lockup/spin
- Light dust marks during normal rolling
- Only created when tires contact ground

**Collision System:**
- Wall bouncing with 50% velocity reduction
- Obstacle collision with directional bouncing
- Spatial audio positioned at impact points

##### Code Architecture
**IIFE Pattern:** All code wrapped in immediately invoked function expressions
**Modular Functions:**
- `updateGroundContact()`: Individual tire platform detection
- `updateGravityAndOrientation()`: Physics simulation
- `updateSuspension()`: Spring-damper calculations
- `updateEngineSound()`: Dynamic audio generation
- `createSkidMark()`: Visual effects system

**Performance Optimizations:**
- 60fps requestAnimationFrame loop
- Conditional physics calculations based on ground contact
- Efficient spatial audio updates
- Frame-limited skid mark generation

### Pending Features
1. **Browser Country zones**: Modify controls based on driving side
2. **Detour powerup mechanic**: Distraction/navigation elements  
3. **Landing page integration**: Connect game to extension story

### Development Notes
- Car physics tuned for realistic feel while maintaining fun gameplay
- Audio designed for subtle background ambiance, not overwhelming
- Visual style maintains retro Mac aesthetic throughout
- All forces respect real-world physics constraints

This implementation demonstrates advanced web technologies:
- WebGL 3D rendering via Three.js
- Web Audio API with spatial positioning  
- Complex physics simulation
- Real-time collision detection
- Performance-optimized animation loops

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.