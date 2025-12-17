let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;
let lockedScreenPosition = null;
let lastVehiclePosition = null;
let positionUpdateCounter = 0;

function initBrowser() {
    if (browser) return;
    
    browser = mp.browsers.new("package://dis-veh/index.html");
    browser.active = false;
}

function destroyBrowser() {
    if (browser) {
        browser.destroy();
        browser = null;
    }
}

function getVehicleInfo(vehicle) {
    if (!vehicle || !vehicle.handle) return null;

    const modelHash = vehicle.getModel();
    let brandName = null;
    let modelName = null;

    try {
        const displayName = mp.game.vehicle.getDisplayNameFromVehicleModel(modelHash);
        if (displayName && displayName !== 'CARNOTFOUND' && displayName !== 'NULL') {
            const cleanName = displayName.replace(/_/g, ' ').trim();
            const parts = cleanName.split(/\s+/);
            if (parts.length >= 2) {
                brandName = parts[0].toUpperCase();
                modelName = parts.slice(1).join(' ').toUpperCase();
            } else {
                modelName = cleanName.toUpperCase();
            }
        }
    } catch (e) {}

    if (!brandName) {
        try {
            const makeName = mp.game.vehicle.getMakeNameFromVehicleModel(modelHash);
            if (makeName && makeName !== 'CARNOTFOUND' && makeName !== 'NULL') {
                brandName = makeName.replace(/_/g, ' ').toUpperCase().trim();
            }
        } catch (e) {}
    }

    if (!modelName && vehicle.model && typeof vehicle.model === 'string') {
        const cleanModel = vehicle.model.replace(/_/g, ' ').toUpperCase().trim();
        const parts = cleanModel.split(/\s+/);
        if (parts.length >= 2 && !brandName) {
            brandName = parts[0];
            modelName = parts.slice(1).join(' ');
        } else {
            modelName = cleanModel;
        }
    }

    if (brandName && modelName) return `${brandName} ${modelName}`;
    if (modelName) return modelName;
    if (brandName) return brandName;

    return null;
}

function getVehicleTextPosition(vehicle) {
    if (!vehicle || !vehicle.handle) return null;
    
    try {
        const vehiclePos = vehicle.getPosition();
        const heading = vehicle.getHeading();
        const headingRad = (heading * Math.PI) / 180;
        
        // Calculate position on LEFT side of vehicle (fixed offset)
        const leftOffset = 2.5; // Distance to left side (positive = left)
        const heightOffset = 1.2; // Height above ground
        const forwardOffset = 0.0; // Forward offset (0 = centered)
        
        const cosHeading = Math.cos(headingRad);
        const sinHeading = Math.sin(headingRad);
        
        // LEFT side vector: perpendicular to forward, pointing LEFT
        // Forward = (sin(heading), cos(heading))
        // Right = (cos(heading), -sin(heading))
        // LEFT = (-cos(heading), sin(heading))
        const leftX = -cosHeading;
        const leftY = sinHeading;
        
        // Forward vector
        const forwardX = sinHeading;
        const forwardY = cosHeading;
        
        const textWorldPos = {
            x: vehiclePos.x + leftX * leftOffset + forwardX * forwardOffset,
            y: vehiclePos.y + leftY * leftOffset + forwardY * forwardOffset,
            z: vehiclePos.z + heightOffset
        };
        
        return textWorldPos;
    } catch (e) {
        return null;
    }
}

function updateBrowserPosition(worldPos, vehicle) {
    if (!browser || !activeVehicleDisplay) return;
    
    try {
        const vehiclePos = vehicle.getPosition();
        
        // Check if vehicle has moved significantly (more than 0.5 units)
        let vehicleMoved = false;
        if (lastVehiclePosition) {
            const distance = Math.sqrt(
                Math.pow(vehiclePos.x - lastVehiclePosition.x, 2) +
                Math.pow(vehiclePos.y - lastVehiclePosition.y, 2) +
                Math.pow(vehiclePos.z - lastVehiclePosition.z, 2)
            );
            vehicleMoved = distance > 0.5;
        } else {
            vehicleMoved = true; // First frame, need to calculate position
        }
        
        // Only update screen position if vehicle moved significantly OR if we don't have a locked position yet
        if (vehicleMoved || !lockedScreenPosition) {
            // Convert 3D world position to screen coordinates
            const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
            
            if (screenPos && screenPos.x !== 0 && screenPos.y !== 0) {
                // Validate screen position is within reasonable bounds
                if (screenPos.x >= -0.5 && screenPos.x <= 1.5 && screenPos.y >= -0.5 && screenPos.y <= 1.5) {
                    // Lock this position - it won't change until vehicle moves significantly
                    lockedScreenPosition = {
                        x: screenPos.x,
                        y: screenPos.y
                    };
                    lastVehiclePosition = {
                        x: vehiclePos.x,
                        y: vehiclePos.y,
                        z: vehiclePos.z
                    };
                    positionUpdateCounter = 0;
                }
            }
        }
        
        // Use locked position if available, otherwise use center
        let screenX = 0.5;
        let screenY = 0.5;
        
        if (lockedScreenPosition) {
            screenX = lockedScreenPosition.x;
            screenY = lockedScreenPosition.y;
        }
        
        // Calculate distance for scale
        let camPos;
        try {
            camPos = mp.game.cam.getGameplayCamCoord();
        } catch {
            camPos = mp.players.local.getPosition();
        }
        
        const distance = Math.sqrt(
            Math.pow(worldPos.x - camPos.x, 2) +
            Math.pow(worldPos.y - camPos.y, 2) +
            Math.pow(worldPos.z - camPos.z, 2)
        );
        
        if (distance > 50) {
            browser.active = false;
            return;
        }
        
        // Calculate scale based on distance
        const scale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
        
        // Update browser with locked position
        browser.active = true;
        const posX = screenX.toFixed(4);
        const posY = screenY.toFixed(4);
        const scaleStr = scale.toFixed(2);
        browser.execute(`updatePosition(${posX}, ${posY}, ${scaleStr});`);
        
        // Increment counter to periodically check if we need to update (every 30 frames = ~0.5 seconds at 60fps)
        positionUpdateCounter++;
        if (positionUpdateCounter > 30) {
            positionUpdateCounter = 0;
            // Force a small update check even if vehicle hasn't moved much
            // This helps if the vehicle is moving slowly
            const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
            if (screenPos && screenPos.x !== 0 && screenPos.y !== 0) {
                if (screenPos.x >= -0.5 && screenPos.x <= 1.5 && screenPos.y >= -0.5 && screenPos.y <= 1.5) {
                    // Only update if the difference is significant (more than 5% of screen)
                    if (lockedScreenPosition) {
                        const diffX = Math.abs(screenPos.x - lockedScreenPosition.x);
                        const diffY = Math.abs(screenPos.y - lockedScreenPosition.y);
                        if (diffX > 0.05 || diffY > 0.05) {
                            lockedScreenPosition.x = screenPos.x;
                            lockedScreenPosition.y = screenPos.y;
                            lastVehiclePosition = {
                                x: vehiclePos.x,
                                y: vehiclePos.y,
                                z: vehiclePos.z
                            };
                        }
                    } else {
                        lockedScreenPosition = {
                            x: screenPos.x,
                            y: screenPos.y
                        };
                        lastVehiclePosition = {
                            x: vehiclePos.x,
                            y: vehiclePos.y,
                            z: vehiclePos.z
                        };
                    }
                }
            }
        }
    } catch (e) {
        // Fallback to locked position or center
        if (lockedScreenPosition) {
            browser.active = true;
            const posX = lockedScreenPosition.x.toFixed(4);
            const posY = lockedScreenPosition.y.toFixed(4);
            browser.execute(`updatePosition(${posX}, ${posY}, 1.0);`);
        } else {
            browser.active = false;
        }
    }
}

function startVehicleDisplay(vehicle, seat) {
    if (displayTimer) {
        clearTimeout(displayTimer);
        displayTimer = null;
    }

    if (!vehicle || !vehicle.handle) return;

    const displayName = getVehicleInfo(vehicle);
    if (!displayName) return;

    const isDriver = seat === -1;
    const duration = isDriver ? 6000 : 3000;
    currentSeat = seat;
    
    // Reset locked position - will be calculated on first frame
    lockedScreenPosition = null;
    lastVehiclePosition = null;
    positionUpdateCounter = 0;

    activeVehicleDisplay = {
        vehicle: vehicle,
        name: displayName,
        startTime: Date.now(),
        duration: duration,
        isDriver: isDriver
    };

    if (browser) {
        browser.active = true;
        const escapedName = displayName.replace(/'/g, "\\'");
        browser.execute(`renderVehicleName('${escapedName}');`);
    }

    displayTimer = setTimeout(() => {
        if (browser) {
            browser.execute('hideVehicleName();');
            setTimeout(() => {
                if (browser) browser.active = false;
            }, 300);
        }
        activeVehicleDisplay = null;
        displayTimer = null;
        lockedScreenPosition = null;
        lastVehiclePosition = null;
    }, duration);
}

function stopVehicleDisplay() {
    if (displayTimer) {
        clearTimeout(displayTimer);
        displayTimer = null;
    }
    
    if (browser) {
        browser.execute('hideVehicleName();');
        setTimeout(() => {
            if (browser) browser.active = false;
        }, 300);
    }
    
    activeVehicleDisplay = null;
    currentSeat = -1;
    lockedScreenPosition = null;
    lastVehiclePosition = null;
}

mp.events.add('render', () => {
    if (!activeVehicleDisplay || !activeVehicleDisplay.vehicle || !activeVehicleDisplay.vehicle.handle) {
        if (browser) browser.active = false;
        return;
    }

    const vehicle = activeVehicleDisplay.vehicle;
    const elapsed = Date.now() - activeVehicleDisplay.startTime;

    if (elapsed >= activeVehicleDisplay.duration) {
        stopVehicleDisplay();
        return;
    }

    if (!mp.vehicles.exists(vehicle)) {
        stopVehicleDisplay();
        return;
    }

    const localPlayer = mp.players.local;
    if (!localPlayer.vehicle || localPlayer.vehicle !== vehicle) {
        stopVehicleDisplay();
        return;
    }

    // Calculate 3D world position on LEFT side of vehicle (attached to vehicle)
    const textWorldPos = getVehicleTextPosition(vehicle);
    if (!textWorldPos) {
        if (browser) browser.active = false;
        return;
    }
    
    // Update browser position - uses locked position that doesn't change with camera
    updateBrowserPosition(textWorldPos, vehicle);
});

mp.events.add('playerEnterVehicle', (vehicle, seat) => {
    startVehicleDisplay(vehicle, seat);
});

mp.events.add('playerLeaveVehicle', () => {
    stopVehicleDisplay();
});

mp.events.add('vehicleDestroy', vehicle => {
    if (activeVehicleDisplay && activeVehicleDisplay.vehicle === vehicle) {
        stopVehicleDisplay();
    }
});

mp.events.add('resourceStop', () => {
    stopVehicleDisplay();
    destroyBrowser();
});

mp.events.add('resourceStart', () => {
    initBrowser();
});

initBrowser();
