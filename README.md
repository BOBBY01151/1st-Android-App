# Vehicle Name Display System - RAGE MP

A vehicle name display system for RAGE MP that shows the vehicle name attached to the left side of the vehicle in 3D space.

## Features

- ✅ Vehicle name displays on the **left side** of the vehicle
- ✅ Text is **attached to the vehicle in 3D space** - it moves naturally with the vehicle
- ✅ No jittering or unwanted movement when the camera moves
- ✅ Dynamic scaling based on distance from camera
- ✅ Smooth fade in/out animations
- ✅ Different display durations for driver (6s) vs passenger (3s)

## Key Changes from Original

### What Was Fixed:
The original code tried to "lock" the screen position with aggressive smoothing and position locking mechanisms. This was the wrong approach because:
- Screen positions naturally change as the camera moves (this is correct behavior!)
- Trying to lock the screen position fights against the natural 3D-to-2D conversion
- The text would drift and not stay attached to the vehicle

### The Solution:
1. **Removed all position smoothing and locking** - the text now updates its screen position every frame based on the vehicle's current 3D position
2. **Kept only scale smoothing** - scale changes are slightly smoothed for a better visual experience
3. **Simplified the update logic** - direct 3D-to-2D conversion without interference

The text now stays perfectly attached to the vehicle's left side because:
- Every frame, we calculate the 3D world position relative to the vehicle (using the vehicle's position and heading)
- We convert this 3D position to screen coordinates
- We directly use these coordinates without smoothing
- As the vehicle moves or rotates, the 3D offset moves with it naturally
- As the camera moves, the screen position updates naturally to keep the text at the correct screen location

## Installation

1. Place `index.js` and `index.html` in your resource folder (e.g., `client_packages/dis-veh/`)
2. Make sure the resource is loaded in your server configuration
3. The browser path in `index.js` should match your resource structure: `package://dis-veh/index.html`

## Configuration

You can adjust these values in `getVehicleTextPosition()` function in `index.js`:

```javascript
const leftOffset = 2.5;      // Distance to left side (increase to move further left)
const heightOffset = 1.2;     // Height above ground
const forwardOffset = 0.0;    // Forward/backward position (positive = forward)
```

## How It Works

1. When player enters a vehicle, the system calculates a 3D world position on the left side of the vehicle
2. Every render frame:
   - Updates the 3D position based on vehicle's current position and rotation
   - Converts 3D world coordinates to 2D screen coordinates
   - Updates the browser overlay position
3. The text stays "attached" because it's anchored to the vehicle's 3D coordinate system

## Technical Details

- Uses RAGE MP's `mp.game.graphics.world3dToScreen2d()` for coordinate conversion
- The 3D offset is calculated using the vehicle's heading (rotation)
- Left side vector: `(-cos(heading), sin(heading))` ensures proper positioning regardless of vehicle orientation
- Scale adjusts dynamically based on camera distance (min: 0.7, max: 1.3)
