let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;
let lockedScreenPosition = null;
let lastVehiclePosition = null;
let positionUpdateThreshold = 0.5; // Update position if vehicle moves more than 0.5 units

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

function calculateScreenPosition(worldPos) {
    if (!worldPos) return null;
    
    try {
        // Convert 3D world position to screen coordinates
        const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
        
        if (!screenPos || (screenPos.x === 0 && screenPos.y === 0)) {
            return null;
        }
        
        // Validate screen position
        if (screenPos.x < -0.5 || screenPos.x > 1.5 || screenPos.y < -0.5 || screenPos.y > 1.5) {
            return null;
        }
        
        return { x: screenPos.x, y: screenPos.y };
    } catch (e) {
        return null;
    }
}

function shouldUpdatePosition(vehicle) {
    if (!vehicle || !vehicle.handle) return false;
    
    try {
        const currentPos = vehicle.getPosition();
        
        if (!lastVehiclePosition) {
            lastVehiclePosition = currentPos;
            return true; // First time, always update
        }
        
        // Calculate distance moved
        const distance = Math.sqrt(
            Math.pow(currentPos.x - lastVehiclePosition.x, 2) +
            Math.pow(currentPos.y - lastVehiclePosition.y, 2) +
            Math.pow(currentPos.z - lastVehiclePosition.z, 2)
        );
        
        // Update if vehicle moved significantly
        if (distance > positionUpdateThreshold) {
            lastVehiclePosition = currentPos;
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

function updateBrowserPosition() {
    if (!browser || !activeVehicleDisplay) return;
    
    const vehicle = activeVehicleDisplay.vehicle;
    if (!vehicle || !vehicle.handle) return;
    
    // Check if we need to update position (only when vehicle moves, not camera)
    const needsUpdate = shouldUpdatePosition(vehicle);
    
    if (needsUpdate || !lockedScreenPosition) {
        // Calculate new world position relative to vehicle
        const textWorldPos = getVehicleTextPosition(vehicle);
        if (!textWorldPos) {
            if (lockedScreenPosition) {
                // Use locked position if calculation fails
                browser.active = true;
                const posX = lockedScreenPosition.x.toFixed(4);
                const posY = lockedScreenPosition.y.toFixed(4);
                const scale = lockedScreenPosition.scale.toFixed(2);
                browser.execute(`updatePosition(${posX}, ${posY}, ${scale});`);
            }
            return;
        }
        
        // Calculate screen position
        const screenPos = calculateScreenPosition(textWorldPos);
        if (screenPos) {
            // Calculate distance for scale
            let camPos;
            try {
                camPos = mp.game.cam.getGameplayCamCoord();
            } catch {
                camPos = mp.players.local.getPosition();
            }
            
            const distance = Math.sqrt(
                Math.pow(textWorldPos.x - camPos.x, 2) +
                Math.pow(textWorldPos.y - camPos.y, 2) +
                Math.pow(textWorldPos.z - camPos.z, 2)
            );
            
            if (distance > 50) {
                browser.active = false;
                return;
            }
            
            // Calculate scale based on distance
            const scale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
            
            // Lock the screen position - this won't change until vehicle moves
            lockedScreenPosition = {
                x: screenPos.x,
                y: screenPos.y,
                scale: scale
            };
        }
    }
    
    // Use locked position (doesn't change with camera movement)
    if (lockedScreenPosition) {
        browser.active = true;
        const posX = lockedScreenPosition.x.toFixed(4);
        const posY = lockedScreenPosition.y.toFixed(4);
        const scale = lockedScreenPosition.scale.toFixed(2);
        browser.execute(`updatePosition(${posX}, ${posY}, ${scale});`);
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
    
    // Reset locked position
    lockedScreenPosition = null;
    lastVehiclePosition = null;

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

    // Update browser position - only updates when vehicle moves, not camera
    updateBrowserPosition();
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
