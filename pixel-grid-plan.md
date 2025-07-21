# Triglavis Pixel Grid Implementation Plan

## Overview
Transform the Triglavis.com homepage to feature an interactive grid of "therefore" mathematical symbols (∴) that respond to cursor movement and create a ripple effect when the logo is clicked.

## Technical Architecture

### 1. Grid System
- Create a full-screen grid of cells behind the main logo
- Each cell contains the "∴" symbol with three states:
  - Off: #333 (light mode) / #ccc (dark mode)
  - Partial: #666 (light mode) / #999 (dark mode)
  - On: #999 (light mode) / #666 (dark mode)
- Grid density: ~40-50 cells horizontally on desktop, responsive scaling

### 2. Interaction States
- **Idle**: All cells in "off" state
- **Hover**: Cells illuminate in a radius around cursor (gradient falloff)
- **Click**: Ripple effect emanates from center when logo is clicked

### 3. Implementation Details

#### HTML Structure
```html
<div class="pixel-grid" id="pixelGrid"></div>
<main class="container">
    <div class="content">
        <picture class="logo-wrapper" id="logoWrapper">
            <!-- Existing logo -->
        </picture>
    </div>
</main>
```

#### CSS Classes
- `.pixel-grid`: Full-screen container, position: fixed
- `.pixel-cell`: Individual grid cells
- `.pixel-symbol`: The ∴ symbol inside each cell
- States: `.state-off`, `.state-partial`, `.state-on`
- Animation: `.ripple-active`

#### JavaScript Functionality
1. **Grid Generation**
   - Calculate grid dimensions based on viewport
   - Generate cells dynamically
   - Assign unique coordinates to each cell

2. **Mouse Tracking**
   - Track cursor position
   - Calculate distance from cursor to each cell
   - Update cell states based on proximity

3. **Ripple Animation**
   - On logo click, calculate distance from center to each cell
   - Animate cells in waves based on distance
   - Use requestAnimationFrame for smooth performance

### 4. Performance Optimizations
- Use CSS transforms instead of position changes
- Batch DOM updates
- Throttle mousemove events
- Use will-change for animated properties
- Consider using CSS Grid for layout

### 5. Responsive Behavior
- Adjust grid density on different screen sizes
- Scale symbol size appropriately
- Maintain performance on mobile devices

### 6. Dark/Light Mode
- Invert color values in dark mode
- Smooth transitions when mode changes
- Maintain contrast ratios

## File Changes

### Modified Files
1. `index.html` - Add grid container and update logo wrapper
2. `styles.css` - Add grid styles and animations

### New Files
1. `grid.js` - Grid generation and interaction logic

## Testing Checklist
- [ ] Grid renders correctly on all screen sizes
- [ ] Hover effect follows cursor smoothly
- [ ] Ripple animation performs well
- [ ] Dark/light mode transitions work
- [ ] Logo remains clickable
- [ ] Performance is acceptable on mobile
- [ ] No accessibility regressions