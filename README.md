# RAGE MP Vehicle Name Display - Fixed

This repository contains a fixed version of the RAGE MP vehicle name display system.

## Problem
The vehicle name text was moving with the camera instead of staying attached to the vehicle.

## Solution
The text is now properly attached to the vehicle's left side using continuous 3D-to-2D conversion each frame, instead of trying to lock screen coordinates.

## Files
- `/dis-veh/index.js` - Fixed client-side script with proper vehicle attachment
- `/dis-veh/index.html` - Browser UI for displaying vehicle name
- `/dis-veh/README.md` - Detailed explanation of changes

## Installation
1. Copy the `dis-veh` folder to your RAGE MP `client_packages` directory
2. Restart the resource or server
3. Enter any vehicle to see the vehicle name displayed on the left side

## Features
- ✅ Text stays attached to vehicle's left side
- ✅ Doesn't move when camera rotates
- ✅ Scales based on distance
- ✅ Smooth animations
- ✅ Auto-hides when vehicle is out of view or too far
- ✅ Shows for 6 seconds (driver) or 3 seconds (passenger)
