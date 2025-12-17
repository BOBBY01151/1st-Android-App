/**
 * Vehicle Name Display Script
 * Uses native 3D text drawing to attach vehicle name to vehicle's left side
 * The text stays fixed to the vehicle even when moving the camera
 */

let activeVehicleDisplay = null;
let displayTimer = null;
let currentSeat = -1;

// Text styling configuration
const TEXT_CONFIG = {
    font: 4, // Pricedown font (0=normal, 1=handwritten, 2=caps, 4=pricedown, 7=cursive)
    scale: 0.45,
    color: { r: 26, g: 85, b: 112, a: 255 }, // #1a5570 color
    outline: true,
    dropShadow: { distance: 2, r: 0, g: 0, b: 0, a: 255 },
    // Background panel settings (set enabled: false to disable)
    background: {
        enabled: true,
        color: { r: 0, g: 0, b: 0, a: 150 },
        padding: { x: 0.01, y: 0.005 }
    },
    // Position offset from vehicle center (left side)
    offset: {
        left: 2.2,      // Distance to left side
        height: 0.8,    // Height above vehicle base
        forward: 0.3    // Slight forward offset
    }
};

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
        
        const { left, height, forward } = TEXT_CONFIG.offset;
        
        const cosHeading = Math.cos(headingRad);
        const sinHeading = Math.sin(headingRad);
        
        // LEFT side vector: perpendicular to forward, pointing LEFT
        // Forward = (sin(heading), cos(heading))
        // LEFT = (-cos(heading), sin(heading))
        const leftX = -cosHeading;
        const leftY = sinHeading;
        
        // Forward vector
        const forwardX = sinHeading;
        const forwardY = cosHeading;
        
        const textWorldPos = {
            x: vehiclePos.x + leftX * left + forwardX * forward,
            y: vehiclePos.y + leftY * left + forwardY * forward,
            z: vehiclePos.z + height
        };
        
        return textWorldPos;
    } catch (e) {
        return null;
    }
}

function getTextWidth(text, font, scale) {
    // Estimate text width based on character count and scale
    // This is an approximation since GTA doesn't give exact measurements easily
    const charWidth = 0.012 * scale; // Base character width
    return text.length * charWidth;
}

function drawText3DAttached(text, worldPos, alpha = 255) {
    if (!text || !worldPos) return;
    
    try {
        // Get camera position for distance check
        let camPos;
        try {
            camPos = mp.game.cam.getGameplayCamCoord();
        } catch {
            camPos = mp.players.local.getPosition();
        }
        
        // Calculate distance
        const distance = Math.sqrt(
            Math.pow(worldPos.x - camPos.x, 2) +
            Math.pow(worldPos.y - camPos.y, 2) +
            Math.pow(worldPos.z - camPos.z, 2)
        );
        
        // Don't draw if too far
        if (distance > 50) return;
        
        // Calculate scale based on distance (closer = larger)
        const distanceScale = Math.max(0.3, Math.min(1.0, 8 / Math.max(distance, 3)));
        const finalScale = TEXT_CONFIG.scale * distanceScale;
        
        // SET_DRAW_ORIGIN - This is the key! It sets a 3D world position as the origin for 2D draws
        // This makes the text "attached" to the world position - it won't move when camera moves
        mp.game.graphics.setDrawOrigin(worldPos.x, worldPos.y, worldPos.z, 0);
        
        // Draw background panel if enabled
        if (TEXT_CONFIG.background && TEXT_CONFIG.background.enabled) {
            const textWidth = getTextWidth(text, TEXT_CONFIG.font, finalScale);
            const textHeight = 0.025 * finalScale;
            const padding = TEXT_CONFIG.background.padding;
            
            const bgAlpha = Math.floor((alpha / 255) * TEXT_CONFIG.background.color.a);
            
            mp.game.graphics.drawRect(
                0.0,  // X centered at origin
                0.0,  // Y centered at origin
                textWidth + padding.x * 2,
                textHeight + padding.y * 2,
                TEXT_CONFIG.background.color.r,
                TEXT_CONFIG.background.color.g,
                TEXT_CONFIG.background.color.b,
                bgAlpha,
                false
            );
        }
        
        // Configure text appearance
        mp.game.ui.setTextFont(TEXT_CONFIG.font);
        mp.game.ui.setTextScale(finalScale, finalScale);
        mp.game.ui.setTextColour(
            TEXT_CONFIG.color.r,
            TEXT_CONFIG.color.g,
            TEXT_CONFIG.color.b,
            alpha
        );
        mp.game.ui.setTextCentre(true);
        
        // Add outline for better visibility
        if (TEXT_CONFIG.outline) {
            mp.game.ui.setTextOutline();
        }
        
        // Add drop shadow
        if (TEXT_CONFIG.dropShadow) {
            mp.game.ui.setTextDropshadow(
                TEXT_CONFIG.dropShadow.distance,
                TEXT_CONFIG.dropShadow.r,
                TEXT_CONFIG.dropShadow.g,
                TEXT_CONFIG.dropShadow.b,
                Math.floor((alpha / 255) * TEXT_CONFIG.dropShadow.a)
            );
        }
        
        // Begin text command and display
        // Using the proper native sequence for text drawing
        mp.game.invoke('0x25FBB336DF1804CB', 'STRING'); // BEGIN_TEXT_COMMAND_DISPLAY_TEXT
        mp.game.invoke('0x6C188BE134E074AA', text);      // ADD_TEXT_COMPONENT_SUBSTRING_PLAYER_NAME
        mp.game.invoke('0xCD015E5BB0D96A57', 0.0, 0.0);  // END_TEXT_COMMAND_DISPLAY_TEXT at origin
        
        // Clear the draw origin so other draws aren't affected
        mp.game.graphics.clearDrawOrigin();
        
    } catch (e) {
        // Silently fail if drawing fails
        try {
            mp.game.graphics.clearDrawOrigin();
        } catch {}
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

    // Clean the name (remove numbers)
    const cleanName = displayName.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();

    activeVehicleDisplay = {
        vehicle: vehicle,
        name: cleanName,
        startTime: Date.now(),
        duration: duration,
        isDriver: isDriver,
        opacity: 0 // For fade in effect
    };

    displayTimer = setTimeout(() => {
        activeVehicleDisplay = null;
        displayTimer = null;
    }, duration);
}

function stopVehicleDisplay() {
    if (displayTimer) {
        clearTimeout(displayTimer);
        displayTimer = null;
    }
    
    activeVehicleDisplay = null;
    currentSeat = -1;
}

mp.events.add('render', () => {
    if (!activeVehicleDisplay || !activeVehicleDisplay.vehicle || !activeVehicleDisplay.vehicle.handle) {
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

    // Calculate 3D world position on LEFT side of vehicle
    const textWorldPos = getVehicleTextPosition(vehicle);
    if (!textWorldPos) return;
    
    // Calculate fade effect
    const fadeInDuration = 300;
    const fadeOutStart = activeVehicleDisplay.duration - 300;
    
    let alpha = 255;
    if (elapsed < fadeInDuration) {
        // Fade in
        alpha = Math.floor((elapsed / fadeInDuration) * 255);
    } else if (elapsed > fadeOutStart) {
        // Fade out
        alpha = Math.floor(((activeVehicleDisplay.duration - elapsed) / 300) * 255);
    }
    
    // Clamp alpha
    alpha = Math.max(0, Math.min(255, alpha));
    
    // Draw the text attached to the 3D position
    drawText3DAttached(activeVehicleDisplay.name, textWorldPos, alpha);
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
});
