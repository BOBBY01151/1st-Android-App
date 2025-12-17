# Vehicle Name Display Script (dis-veh)

A RAGE MP client-side script that displays the vehicle name when entering a vehicle. The text is **truly attached** to the vehicle's left side and stays fixed even when moving the camera.

## Features

- **3D Attached Text**: Uses GTA V's native `SET_DRAW_ORIGIN` to attach text to a 3D world position
- **Fixed Position**: Text stays attached to the vehicle even when you move the camera around
- **Left Side Display**: Text appears on the left side of the vehicle
- **Distance Scaling**: Text scales based on distance for better visibility
- **Fade In/Out**: Smooth fade animations when entering/exiting vehicle
- **Auto Brand Detection**: Automatically extracts vehicle brand and model name

## How It Works

The key difference from screen-space overlays (like CEF browsers) is the use of `mp.game.graphics.setDrawOrigin()`. This native function sets a 3D world position as the origin for 2D drawing operations, making the text appear "attached" to that world position regardless of camera movement.

## Configuration

You can customize the text appearance by modifying `TEXT_CONFIG` in `index.js`:

```javascript
const TEXT_CONFIG = {
    font: 4, // 0=normal, 1=handwritten, 2=caps, 4=pricedown, 7=cursive
    scale: 0.5,
    color: { r: 26, g: 85, b: 112, a: 255 }, // #1a5570
    outline: true,
    dropShadow: { distance: 2, r: 0, g: 0, b: 0, a: 255 },
    offset: {
        left: 2.2,      // Distance to left side
        height: 0.8,    // Height above vehicle base
        forward: 0.3    // Forward/backward offset
    }
};
```

## Installation

1. Place the `dis-veh` folder in your server's `client_packages` directory
2. Add `'dis-veh'` to your `index.js` in `client_packages`:

```javascript
require('./dis-veh');
```

## Display Duration

- **Driver seat**: 6 seconds
- **Passenger seats**: 3 seconds
