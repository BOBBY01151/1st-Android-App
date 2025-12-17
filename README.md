# RageMP Vehicle Name Display System

A vehicle name display system for RageMP that shows the vehicle name attached to the left side of the vehicle.

## Features

- Vehicle name displays when entering a vehicle (6 seconds for driver, 3 seconds for passenger)
- Text is properly attached to the vehicle's 3D position on the left side
- Text moves naturally with the vehicle as you move the camera around
- Distance-based scaling for better visibility
- Smooth fade in/out animations

## Changes Made

### Fixed the camera movement issue:
- **Removed position locking mechanism** - The old code was trying to lock the text to a fixed screen position, which made it detach from the vehicle when moving the camera
- **Removed excessive smoothing** - The aggressive position smoothing was preventing the text from following the vehicle naturally
- **Pure 3D attachment** - Now the text position is calculated from the vehicle's 3D world position every frame and converted to screen coordinates, creating a natural attachment effect
- **Text stays on the left side** - The text is positioned 2.5 units to the left of the vehicle and moves with it

### How it works:
1. Calculates the 3D world position on the left side of the vehicle each frame
2. Converts that 3D position to screen coordinates
3. Updates the browser position based on the current screen coordinates
4. This makes the text appear "attached" to the vehicle, moving naturally as the camera moves

## Installation

Place these files in your RageMP client_packages folder:
- `index.js` - Main client script
- `index.html` - UI display

Make sure the browser URL in `index.js` matches your package name (`package://dis-veh/index.html`)
