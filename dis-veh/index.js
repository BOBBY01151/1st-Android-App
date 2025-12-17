let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;
let browser = null;

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

    // Keep browser active - position is fixed in CSS (left side of screen)
    if (browser) {
        browser.active = true;
    }
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
