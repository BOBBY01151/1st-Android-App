let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;

// Smoothing (keep it attached, just reduce jitter)
let smoothedScreenX = 0.5;
let smoothedScreenY = 0.5;
let smoothedScale = 1.0;

// Smaller = smoother but more lag. Bigger = snappier but more jitter.
const positionLerp = 0.35;
const scaleLerp = 0.25;

// Left-side attachment offset (GTA entity local axes: X=right, Y=forward, Z=up)
const attachOffset = {
    x: -2.4, // left side
    y: 0.0,  // center forward/back
    z: 1.0   // height
};

function initBrowser() {
    if (browser) return;
    browser = mp.browsers.new('package://dis-veh/index.html');
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

function getVehicleTextWorldPos(vehicle) {
    if (!vehicle || !vehicle.handle) return null;

    // Preferred: native offset from entity (stable, no heading math)
    try {
        const pos = mp.game.entity.getOffsetFromEntityInWorldCoords(
            vehicle.handle,
            attachOffset.x,
            attachOffset.y,
            attachOffset.z
        );
        if (pos && typeof pos.x === 'number') return pos;
    } catch (e) {}

    // Fallback: heading math
    try {
        const vehiclePos = vehicle.getPosition();
        const heading = vehicle.getHeading();
        const headingRad = (heading * Math.PI) / 180;

        const cosHeading = Math.cos(headingRad);
        const sinHeading = Math.sin(headingRad);

        // LEFT = (-cos, sin)
        const leftX = -cosHeading;
        const leftY = sinHeading;

        // Forward = (sin, cos)
        const forwardX = sinHeading;
        const forwardY = cosHeading;

        return {
            x: vehiclePos.x + leftX * Math.abs(attachOffset.x) + forwardX * attachOffset.y,
            y: vehiclePos.y + leftY * Math.abs(attachOffset.x) + forwardY * attachOffset.y,
            z: vehiclePos.z + attachOffset.z
        };
    } catch (e) {
        return null;
    }
}

function updateBrowserPosition(worldPos) {
    if (!browser || !activeVehicleDisplay) return;

    // Convert 3D world position to screen coordinates (updates every frame = stays attached)
    let screenPos;
    try {
        screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);
    } catch (e) {
        screenPos = null;
    }

    // If not on screen, hide
    if (!screenPos || (screenPos.x === 0 && screenPos.y === 0)) {
        browser.active = false;
        return;
    }

    // If wildly off-screen, hide
    if (screenPos.x < -0.2 || screenPos.x > 1.2 || screenPos.y < -0.2 || screenPos.y > 1.2) {
        browser.active = false;
        return;
    }

    // Smooth (no locking)
    smoothedScreenX = smoothedScreenX + (screenPos.x - smoothedScreenX) * positionLerp;
    smoothedScreenY = smoothedScreenY + (screenPos.y - smoothedScreenY) * positionLerp;

    // Scale by distance
    let camPos;
    try {
        camPos = mp.game.cam.getGameplayCamCoord();
    } catch (e) {
        camPos = mp.players.local.getPosition();
    }

    const dx = worldPos.x - camPos.x;
    const dy = worldPos.y - camPos.y;
    const dz = worldPos.z - camPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 60) {
        browser.active = false;
        return;
    }

    const targetScale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
    smoothedScale = smoothedScale + (targetScale - smoothedScale) * scaleLerp;

    browser.active = true;
    browser.execute(
        `updatePosition(${smoothedScreenX.toFixed(4)}, ${smoothedScreenY.toFixed(4)}, ${smoothedScale.toFixed(2)});`
    );
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

    // Reset smoothing so it snaps to the correct place quickly
    smoothedScreenX = 0.5;
    smoothedScreenY = 0.5;
    smoothedScale = 1.0;

    activeVehicleDisplay = {
        vehicle,
        name: displayName,
        startTime: Date.now(),
        duration,
        isDriver
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

    const textWorldPos = getVehicleTextWorldPos(vehicle);
    if (!textWorldPos) {
        if (browser) browser.active = false;
        return;
    }

    updateBrowserPosition(textWorldPos);
});

mp.events.add('playerEnterVehicle', (vehicle, seat) => startVehicleDisplay(vehicle, seat));
mp.events.add('playerLeaveVehicle', () => stopVehicleDisplay());
mp.events.add('vehicleDestroy', (vehicle) => {
    if (activeVehicleDisplay && activeVehicleDisplay.vehicle === vehicle) stopVehicleDisplay();
});

mp.events.add('resourceStop', () => {
    stopVehicleDisplay();
    destroyBrowser();
});

mp.events.add('resourceStart', () => initBrowser());

initBrowser();
