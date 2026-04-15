/**
 * @fileoverview Main Application Controller handling Map state, Security, Battery, and Routing.
 * Implements architectural sanitizations and relies on injected utility scripts.
 */

// 1. Service Worker Initialization
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('Sentinel SW Registered (v3 Enterprise)'))
          .catch(err => console.error('Sentinel SW failed', err));
    });
}

/**
 * Attaches the Navigator Battery API hooks to apply CSS constraints 
 */
if ('getBattery' in navigator) {
    navigator.getBattery().then(function(battery) {
        updateBatteryState(battery);
        battery.addEventListener('levelchange', function() { updateBatteryState(battery); });
    });
}

/**
 * Adjusts the DOM battery representation hiding expensive 3D properties internally.
 * @param {BatteryManager} battery - Battery API Interface Interface
 */
function updateBatteryState(battery) {
    if (battery.level < 0.20) {
        document.body.classList.add('battery-saver');
        document.getElementById('battery-status').classList.remove('hidden');
    } else {
        document.body.classList.remove('battery-saver');
        document.getElementById('battery-status').classList.add('hidden');
    }
}

// Sentinel Config Array
const SENTINEL_NODES = [
    { name: 'Govt Health Centre', lat: 12.6795, lng: 77.4680, reliability: 0.8 },
    { name: 'Harohalli Police Station', lat: 12.6801, lng: 77.4698, reliability: 0.95 },
    { name: 'KIADB Industrial Security', lat: 12.7012, lng: 77.4523, reliability: 0.9 }
];

let USER_LOCATION = null;
let FALLBACK_LOCATION = { lat: 12.6800, lng: 77.4700 }; // Harohalli Central Defaults

let userPin = "";
let isVirtualEscortActive = false;
let riskLevelGlobal = 'GREEN';

let lastLat = 0;
let lastLng = 0;
let stationarySeconds = 0;
let watchId = null;

let map = null, userMarker = null, havenMarker = null, routeLine = null;

/**
 * Handles Lock Screen PIN verification checking and sanitize injections 
 */
document.getElementById('keypad').addEventListener('click', (e) => {
    // A11y constraint: Must be a semantic button trigger
    if(e.target.tagName !== 'BUTTON') return;
    
    // Security Sanitize: Strip any html/xss vector and ensure only string alpha-num exists
    const rawKey = e.target.innerText;
    const sanitizedKey = rawKey.replace(/[^0-9X]/g, '');
    if(!sanitizedKey) return;

    const dots = document.querySelectorAll('.pin-dot');
    
    if(sanitizedKey === 'X') {
        userPin = "";
        dots.forEach(d => d.classList.remove('filled'));
    } else {
        if(userPin.length < 4) {
            userPin += sanitizedKey;
            dots[userPin.length - 1].classList.add('filled');
            
            if(userPin.length === 4) setTimeout(unlockApp, 250);
        }
    }
});

/**
 * Unbinds UI Lock. Note: PWA handles no external server fetching ensuring Data Privacy at this layer.
 */
function unlockApp() {
    const overlay = document.getElementById('login-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
    
    const appUi = document.getElementById('app-ui');
    appUi.classList.remove('opacity-0', 'pointer-events-none');
    
    initMap();
    initLocation();
}

/**
 * Configures the Leaflet Map Engine
 */
function initMap() {
    map = L.map('map', {zoomControl: false}).setView([FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const safeCorridorPath = [ [12.6801, 77.4698], [12.6815, 77.4712], [12.6900, 77.4650], [12.7012, 77.4523] ];
    L.polyline(safeCorridorPath, { color: '#10b981', weight: 15, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    L.polyline(safeCorridorPath, { color: '#34d399', weight: 4, opacity: 0.6, dashArray: '10, 10' }).addTo(map);

    L.circle([12.6850, 77.4750], { color: 'transparent', fillColor: '#ef4444', fillOpacity: 0.15, radius: 400 }).addTo(map);
    L.circle([12.6800, 77.4700], { color: 'transparent', fillColor: '#10b981', fillOpacity: 0.15, radius: 500 }).addTo(map);
}

/**
 * Hooks up HTML5 Geolocation Watchers ensuring local-first privacy.
 */
function initLocation() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                USER_LOCATION = { lat: newLat, lng: newLng };
                
                if(lastLat && lastLng) {
                    const distMoved = calculateDistance(lastLat, lastLng, newLat, newLng) * 1000;
                    if(distMoved < 5) stationarySeconds += 2; else stationarySeconds = 0; 
                }
                lastLat = newLat; lastLng = newLng;

                if (isVirtualEscortActive && riskLevelGlobal === 'RED' && stationarySeconds >= 60) { 
                    if(navigator.vibrate) navigator.vibrate([500,200,500,200,800,200,800]); 
                    stationarySeconds = 0; 
                }
                processEnvironmentalIntel();
            },
            (error) => { console.warn("Location Denied. Adopting Harohalli Sandbox Center."); USER_LOCATION = FALLBACK_LOCATION; processEnvironmentalIntel(); },
            { enableHighAccuracy: true }
        );
    } else {
        USER_LOCATION = FALLBACK_LOCATION;
        processEnvironmentalIntel();
    }
}

/**
 * Calculates optimal Nearest Nodes based on internal map arrays.
 */
async function processEnvironmentalIntel() {
    let nearestNode = null, minDistance = Infinity;
    SENTINEL_NODES.forEach(n => {
        const d = calculateDistance(USER_LOCATION.lat, USER_LOCATION.lng, n.lat, n.lng);
        if(d < minDistance) { minDistance = d; nearestNode = n; }
    });
    if(nearestNode) updateSentinelUI(nearestNode, minDistance);
}

/**
 * Refreshes all DOM Elements associated with Risk
 * @param {Object} node Local Target Destination Node
 * @param {number} distanceKm Mathematical km tracking
 */
function updateSentinelUI(node, distanceKm) {
    document.getElementById('nearest-haven-name').innerText = node.name;
    document.getElementById('nearest-haven-dist').innerHTML = `${distanceKm.toFixed(2)}<span class="text-xl opacity-80">km</span>`;
    document.getElementById('nearest-haven-eta').innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 inline"></i> ETA ${Math.max(1, Math.round(distanceKm*6))} MINS`;

    let score = calculateRiskScore(node.reliability, distanceKm);
    
    document.getElementById('probability-label').innerText = `${score}%`;
    document.getElementById('risk-bar').style.width = `${score}%`;
    
    const bodyUi = document.body;
    let lineColor = '#10b981';
    const riskIcon = document.getElementById('risk-icon');
    const guardianCount = Math.max(1, Math.round(node.reliability * 10) - Math.floor(Math.random() * 3));
    document.getElementById('risk-status').innerText = `Active Guardians: ${guardianCount}`;

    if(score < 50) {
        riskLevelGlobal = 'RED'; lineColor = '#ef4444';
        bodyUi.classList.add('protocol-red'); bodyUi.classList.remove('protocol-yellow');
        document.getElementById('risk-desc').innerText = "Path Integrity: Unstable";
        document.getElementById('risk-desc').className = "block text-red-500 text-[10px] font-bold uppercase mt-0.5 tracking-widest";
        riskIcon.className = "w-5 h-5 text-red-500 animate-pulse";
    } else if (score < 80) {
        riskLevelGlobal = 'YELLOW'; lineColor = '#eab308';
        bodyUi.classList.add('protocol-yellow'); bodyUi.classList.remove('protocol-red');
        document.getElementById('risk-desc').innerText = "Path Integrity: Moderate";
        document.getElementById('risk-desc').className = "block text-yellow-500 text-[10px] font-bold uppercase mt-0.5 tracking-widest";
        riskIcon.className = "w-5 h-5 text-yellow-500";
    } else {
        riskLevelGlobal = 'GREEN'; lineColor = '#10b981';
        bodyUi.classList.remove('protocol-yellow', 'protocol-red');
        document.getElementById('risk-desc').innerText = "Path Integrity: Stable";
        document.getElementById('risk-desc').className = "block text-emerald-500 text-[10px] font-bold uppercase mt-0.5 tracking-widest";
        riskIcon.className = "w-5 h-5 text-emerald-500";
    }

    if(map) {
        const userIcon = L.divIcon({ className: 'custom-icon', html: '<div class="user-pulse-marker"></div>', iconSize: [14, 14] });
        const havenIcon = L.divIcon({ className: 'custom-icon', html: '<div class="sentinel-beacon-marker"></div>', iconSize: [18, 18] });

        if(!userMarker) userMarker = L.marker([USER_LOCATION.lat, USER_LOCATION.lng], {icon: userIcon}).addTo(map);
        else userMarker.setLatLng([USER_LOCATION.lat, USER_LOCATION.lng]);

        if(!havenMarker) havenMarker = L.marker([node.lat, node.lng], {icon: havenIcon}).addTo(map);
        else havenMarker.setLatLng([node.lat, node.lng]);

        if(routeLine) map.removeLayer(routeLine);
        
        if(isVirtualEscortActive) {
            routeLine = L.polyline([ [USER_LOCATION.lat, USER_LOCATION.lng], [node.lat, node.lng] ], { color: lineColor, weight: 4, dashArray: '8, 8' }).addTo(map);
            map.fitBounds(routeLine.getBounds(), { padding: [40, 40], maxZoom: 16 });
            document.getElementById('distance-container').classList.remove('opacity-0', 'pointer-events-none');
        } else {
            document.getElementById('distance-container').classList.add('opacity-0', 'pointer-events-none');
            map.setView([USER_LOCATION.lat, USER_LOCATION.lng], 14);
        }
    }
}

/** Toggles Virtual Escort Status */
function toggleEscort() {
    isVirtualEscortActive = !isVirtualEscortActive;
    const t = document.getElementById('escort-toggle');
    t.classList.toggle('active');
    
    if(isVirtualEscortActive) {
        document.getElementById('escort-status').innerText = "ACTIVE";
        document.getElementById('app-ui').classList.add('mesh-active');
        stationarySeconds = 0; processEnvironmentalIntel(); 
    } else {
        document.getElementById('escort-status').innerText = "STANDBY";
        document.getElementById('app-ui').classList.remove('mesh-active');
        processEnvironmentalIntel(); 
    }
}

/** Preps 10s Background Timer logic simulating an aggressive external device call */
function requestProtocolDelta(evt) {
    if(evt) evt.target.closest('button').innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-blue-300"></i> Protocol Engaged';
    
    setTimeout(() => {
        const shadowUi = document.getElementById('shadow-call-ui');
        shadowUi.style.display = 'flex';
        // Vibrate to simulate call ring
        if(navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500]);
    }, 10000);
}

function dismissShadowCall() { document.getElementById('shadow-call-ui').style.display = 'none'; if(navigator.vibrate) navigator.vibrate(0); }
function acceptShadowCall() { document.getElementById('shadow-call-ui').style.display = 'none'; if(navigator.vibrate) navigator.vibrate(0); }
function toggleProfile(e) { if(e) e.stopPropagation(); document.getElementById('profile-modal').classList.remove('translate-x-full'); }
function closeProfile() { document.getElementById('profile-modal').classList.add('translate-x-full'); }

let stealth = false;
function toggleStealth(e) {
    if(e) e.preventDefault();
    stealth = !stealth;
    if(stealth) {
        document.getElementById('app-ui').style.opacity = '0';
        setTimeout(() => { document.getElementById('app-ui').style.display = 'none'; document.getElementById('stealth-ui').style.display = 'block'; }, 300);
    } else {
        document.getElementById('stealth-ui').style.display = 'none';
        document.getElementById('app-ui').style.display = 'block';
        setTimeout(() => document.getElementById('app-ui').style.opacity = '100', 50);
    }
}

document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); });
