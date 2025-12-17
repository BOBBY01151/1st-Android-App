let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;

// Screen smoothing (keeps it stable but still follows camera)
let smoothedScreenX = 0.5;
let smoothedScreenY = 0.5;
let smoothedScale = 1.0;

// 0 = no movement, 1 = snap instantly. Keep this low to reduce jitter.
const positionSmoothing = 0.22;

// Ignore tiny changes (prevents micro-jitter)
const deadzone = 0.0015; // ~0.15% of screen

// Hide if too far
const maxDistance = 50;

function initBrowser() {
    if (browser) return;

    browser = mp.browsers.new("package://dis-veh/index.html");
    browser.active = false;
}

function destroyBrowser() {
    if (!browser) return;
    browser.destroy();
    browser = null;
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

        // Position on LEFT side of vehicle
        const leftOffset = 2.5;
        const heightOffset = 1.2;
        const forwardOffset = 0.0;

        const cosHeading = Math.cos(headingRad);
        const sinHeading = Math.sin(headingRad);

        // LEFT = (-cos(heading), sin(heading))
        const leftX = -cosHeading;
        const leftY = sinHeading;

        // Forward = (sin(heading), cos(heading))
        const forwardX = sinHeading;
        const forwardY = cosHeading;

        return {
            x: vehiclePos.x + leftX * leftOffset + forwardX * forwardOffset,
            y: vehiclePos.y + leftY * leftOffset + forwardY * forwardOffset,
            z: vehiclePos.z + heightOffset
        };
    } catch (e) {
        return null;
    }
}

function getCameraPos() {
    try {
        return mp.game.cam.getGameplayCamCoord();
    } catch (e) {
        return mp.players.local.getPosition();
    }
}

function distanceBetween(a, b) {
    return Math.sqrt(
        Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2) +
        Math.pow(a.z - b.z, 2)
    );
}

function updateBrowserPosition(worldPos) {
    if (!browser || !activeVehicleDisplay) return;

    // Convert 3D -> 2D every frame (THIS is what keeps it attached to the vehicle)
    const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);

    if (!screenPos || (screenPos.x === 0 && screenPos.y === 0)) {
        browser.active = false;
        return;
    }

    // If it goes way offscreen / behind camera, hide
    if (screenPos.x < -0.2 || screenPos.x > 1.2 || screenPos.y < -0.2 || screenPos.y > 1.2) {
        browser.active = false;
        return;
    }

    const camPos = getCameraPos();
    const dist = distanceBetween(worldPos, camPos);

    if (dist > maxDistance) {
        browser.active = false;
        return;
    }

    // Scale with distance
    const targetScale = Math.max(0.7, Math.min(1.3, 12 / Math.max(dist, 5)));

    // Deadzone + smoothing
    const dx = screenPos.x - smoothedScreenX;
    const dy = screenPos.y - smoothedScreenY;

    if (Math.abs(dx) > deadzone) smoothedScreenX += dx * positionSmoothing;
    if (Math.abs(dy) > deadzone) smoothedScreenY += dy * positionSmoothing;

    smoothedScale += (targetScale - smoothedScale) * 0.3;

    browser.active = true;
    browser.execute(`updatePosition(${smoothedScreenX.toFixed(4)}, ${smoothedScreenY.toFixed(4)}, ${smoothedScale.toFixed(2)});`);
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

    // Reset smoothing to current projected position (prevents pop)
    smoothedScreenX = 0.5;
    smoothedScreenY = 0.5;
    smoothedScale = 1.0;

    const worldPos = getVehicleTextPosition(vehicle);
    if (worldPos) {
        const sp = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
        if (sp && !(sp.x === 0 && sp.y === 0)) {
            smoothedScreenX = sp.x;
            smoothedScreenY = sp.y;
        }
    }

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

    const textWorldPos = getVehicleTextPosition(vehicle);
    if (!textWorldPos) {
        if (browser) browser.active = false;
        return;
    }

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
