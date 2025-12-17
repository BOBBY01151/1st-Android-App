let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;

// Smooth only to reduce jitter (do NOT lock)
let hasSmoothedPos = false;
let smoothedScreenX = 0.5;
let smoothedScreenY = 0.5;
let smoothedScale = 1.0;

// Smaller alpha = smoother. Bigger alpha = snappier.
const positionAlpha = 0.2;
const scaleAlpha = 0.25;

// Attachment offsets in VEHICLE LOCAL space (GTA): X=right, Y=forward, Z=up
const attachOffset = {
    x: -2.5, // left side
    y: 0.0,  // centered
    z: 1.2   // above ground
};

const maxDistance = 50;

function initBrowser() {
    if (browser) return;

    browser = mp.browsers.new('package://dis-veh/index.html');
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

    // Best: ask GTA for world coords of a local-space offset
    try {
        const p = mp.game.entity.getOffsetFromEntityInWorldCoords(
            vehicle.handle,
            attachOffset.x,
            attachOffset.y,
            attachOffset.z
        );

        if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
            return p;
        }
    } catch (e) {
        // Fallback below
    }

    // Fallback: manual heading math (less accurate on slopes)
    try {
        const vehiclePos = vehicle.getPosition();
        const heading = vehicle.getHeading();
        const headingRad = (heading * Math.PI) / 180;

        const cosHeading = Math.cos(headingRad);
        const sinHeading = Math.sin(headingRad);

        // LEFT = (-cos(heading), sin(heading))
        const leftX = -cosHeading;
        const leftY = sinHeading;

        // Forward = (sin(heading), cos(heading))
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

    try {
        const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);

        // Off-screen / behind camera
        if (!screenPos || (screenPos.x === 0 && screenPos.y === 0)) {
            browser.active = false;
            return;
        }

        // Hide when far outside bounds (prevents snapping)
        if (screenPos.x < -0.2 || screenPos.x > 1.2 || screenPos.y < -0.2 || screenPos.y > 1.2) {
            browser.active = false;
            return;
        }

        let camPos;
        try {
            camPos = mp.game.cam.getGameplayCamCoord();
        } catch (e) {
            camPos = mp.players.local.getPosition();
        }

        const distance = Math.sqrt(
            Math.pow(worldPos.x - camPos.x, 2) +
            Math.pow(worldPos.y - camPos.y, 2) +
            Math.pow(worldPos.z - camPos.z, 2)
        );

        if (distance > maxDistance) {
            browser.active = false;
            return;
        }

        // Smooth position (but always follow camera/vehicle)
        if (!hasSmoothedPos) {
            smoothedScreenX = screenPos.x;
            smoothedScreenY = screenPos.y;
            hasSmoothedPos = true;
        } else {
            smoothedScreenX = smoothedScreenX + (screenPos.x - smoothedScreenX) * positionAlpha;
            smoothedScreenY = smoothedScreenY + (screenPos.y - smoothedScreenY) * positionAlpha;
        }

        // Scale by distance
        const targetScale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
        smoothedScale = smoothedScale + (targetScale - smoothedScale) * scaleAlpha;

        browser.active = true;
        browser.execute(
            `updatePosition(${smoothedScreenX.toFixed(4)}, ${smoothedScreenY.toFixed(4)}, ${smoothedScale.toFixed(2)});`
        );
    } catch (e) {
        browser.active = false;
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

    // Reset smoothing each time we show
    hasSmoothedPos = false;
    smoothedScreenX = 0.5;
    smoothedScreenY = 0.5;
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
    hasSmoothedPos = false;
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

    // Attached world position on the LEFT of the vehicle
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
