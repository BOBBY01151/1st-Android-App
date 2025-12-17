let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;

// Smooth follow (NOT locked)
let smoothedScreenX = null;
let smoothedScreenY = null;
let smoothedScale = 1.0;

// Tweak these
const POSITION_SMOOTHING = 0.25; // 0..1 (higher = faster follow)
const SCALE_SMOOTHING = 0.30;
const MAX_DISTANCE = 60;

// Vehicle-local offsets (GTA local axes: X=right, Y=forward, Z=up)
const OFFSET_LEFT = -2.5; // negative X = left side
const OFFSET_FORWARD = 0.0;
const OFFSET_UP = 1.2;

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
        // Best way: compute position using vehicle-local offsets.
        // This stays correctly attached even while turning / rolling.
        const pos = mp.game.entity.getOffsetFromEntityInWorldCoords(
            vehicle.handle,
            OFFSET_LEFT,
            OFFSET_FORWARD,
            OFFSET_UP
        );

        if (!pos) return null;

        return { x: pos.x, y: pos.y, z: pos.z };
    } catch (e) {
        return null;
    }
}

function updateBrowserPosition(worldPos) {
    if (!browser || !activeVehicleDisplay) return;

    try {
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

        if (distance > MAX_DISTANCE) {
            browser.active = false;
            return;
        }

        // Convert 3D world position to screen coordinates (updates EVERY frame)
        const screenPos = mp.game.graphics.world3dToScreen2d(worldPos.x, worldPos.y, worldPos.z);

        // If not on-screen / behind camera, hide instead of "locking" to some screen point
        if (!screenPos || (screenPos.x === 0 && screenPos.y === 0)) {
            browser.active = false;
            return;
        }

        // Sanity bounds (a bit generous)
        if (screenPos.x < -0.25 || screenPos.x > 1.25 || screenPos.y < -0.25 || screenPos.y > 1.25) {
            browser.active = false;
            return;
        }

        // Smooth follow (no position locking)
        if (smoothedScreenX === null || smoothedScreenY === null) {
            smoothedScreenX = screenPos.x;
            smoothedScreenY = screenPos.y;
        } else {
            smoothedScreenX = smoothedScreenX + (screenPos.x - smoothedScreenX) * POSITION_SMOOTHING;
            smoothedScreenY = smoothedScreenY + (screenPos.y - smoothedScreenY) * POSITION_SMOOTHING;
        }

        // Scale by distance
        const targetScale = Math.max(0.7, Math.min(1.3, 12 / Math.max(distance, 5)));
        smoothedScale = smoothedScale + (targetScale - smoothedScale) * SCALE_SMOOTHING;

        browser.active = true;
        browser.execute(`updatePosition(${smoothedScreenX.toFixed(4)}, ${smoothedScreenY.toFixed(4)}, ${smoothedScale.toFixed(2)});`);
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

    // Reset smoothing (so it snaps to the right spot quickly)
    smoothedScreenX = null;
    smoothedScreenY = null;
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

mp.events.add('vehicleDestroy', (vehicle) => {
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
