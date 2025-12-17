let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;
let smoothedScale = 1.0;

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

function updateBrowserPosition(worldPos) {
    if (!browser || !activeVehicleDisplay) return;
    
    try {
        // Convert 3D world position to screen coordinates
        const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
        
        if (!screenPos) {
            browser.active = false;
            return;
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
        
        // Calculate target scale with minimal smoothing
        const targetScale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
        smoothedScale = smoothedScale + (targetScale - smoothedScale) * 0.1; 
        
        // Update browser directly with screen position (no position smoothing or locking)
        browser.active = true;
        const posX = screenPos.x.toFixed(4);
        const posY = screenPos.y.toFixed(4);
        const scale = smoothedScale.toFixed(2);
        browser.execute(`updatePosition(${posX}, ${posY}, ${scale});`);
    } catch (e) {
        if (browser) browser.active = false;
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
    
    // Reset smoothed values
    smoothedScale = 1.0;

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
    
    // Update browser position directly
    updateBrowserPosition(textWorldPos);
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
