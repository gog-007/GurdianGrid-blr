// 1. Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('Sentinel SW Registered'))
          .catch(err => console.log('Sentinel SW failed', err));
    });
}

// 2. Battery-Saver Guardian
if ('getBattery' in navigator) {
    navigator.getBattery().then(function(battery) {
        updateBatteryState(battery);
        battery.addEventListener('levelchange', function() { updateBatteryState(battery); });
    });
}

function updateBatteryState(battery) {
    if (battery.level < 0.20) {
        document.body.classList.add('battery-saver');
        document.getElementById('battery-status').classList.remove('hidden');
    } else {
        document.body.classList.remove('battery-saver');
        document.getElementById('battery-status').classList.add('hidden');
    }
}

// 3. Data Handling Resilience - Sentinel Nodes
const SENTINEL_NODES = [
    { name: 'Govt Health Centre', lat: 12.6795, lng: 77.4680, reliability: 0.8 },
    { name: 'Harohalli Police Station', lat: 12.6801, lng: 77.4698, reliability: 0.95 },
    { name: 'KIADB Industrial Security', lat: 12.7012, lng: 77.4523, reliability: 0.9 }
];

let USER_LOCATION = null;
let FALLBACK_LOCATION = { lat: 12.6800, lng: 77.4700 }; // Harohalli Central

let userPin = "";
let isVirtualEscortActive = false;
let riskLevelGlobal = 'GREEN';
let hasWarnedVocally = false;

let lastLat = 0;
let lastLng = 0;
let stationarySeconds = 0;
let watchId = null;

let map = null;
let userMarker = null;
let havenMarker = null;
let routeLine = null;

// Lock Screen Logic
document.getElementById('keypad').addEventListener('click', (e) => {
    if(e.target.tagName !== 'BUTTON') return;
    const key = e.target.innerText;
    
    const dots = document.querySelectorAll('.pin-dot');
    
    if(key === 'X') {
        userPin = "";
        dots.forEach(d => d.classList.remove('filled'));
    } else {
        if(userPin.length < 4) {
            userPin += key;
            dots[userPin.length - 1].classList.add('filled');
            
            if(userPin.length === 4) {
                setTimeout(unlockApp, 250);
            }
        }
    }
});

function unlockApp() {
    const overlay = document.getElementById('login-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
    
    const appUi = document.getElementById('app-ui');
    appUi.classList.remove('opacity-0', 'pointer-events-none');
    
    initMap();
    initLocation();
}

// Map Initialization
function initMap() {
    map = L.map('map', {zoomControl: false}).setView([FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Heat-Grid: Draw the Harohalli High-Trust Corridor natively using geometry
    // This looks like a string of glowing hubs highlighting a safe route
    const safeCorridorPath = [
        [12.6801, 77.4698], // Police Station
        [12.6815, 77.4712], // Main Road
        [12.6900, 77.4650], // Road segment
        [12.7012, 77.4523]  // KIADB Gate
    ];
    
    // Draw the green safe corridor spine
    L.polyline(safeCorridorPath, { color: '#10b981', weight: 15, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    L.polyline(safeCorridorPath, { color: '#34d399', weight: 4, opacity: 0.6, dashArray: '10, 10' }).addTo(map);

    // Draw Heatmap Nodes (Red vs Green)
    // Dark industrial backroad - Unsafe Zone (Red)
    L.circle([12.6850, 77.4750], { color: 'transparent', fillColor: '#ef4444', fillOpacity: 0.15, radius: 400 }).addTo(map);
    // Well lit main road radius - Safe Zone (Green)
    L.circle([12.6800, 77.4700], { color: 'transparent', fillColor: '#10b981', fillOpacity: 0.15, radius: 500 }).addTo(map);
}

// Tracking
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function initLocation() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                USER_LOCATION = { lat: newLat, lng: newLng };
                
                if(lastLat && lastLng) {
                    const distMoved = calculateDistance(lastLat, lastLng, newLat, newLng) * 1000;
                    // Stationary trigger logic
                    if(distMoved < 5) stationarySeconds += 2; else stationarySeconds = 0; 
                }
                lastLat = newLat; lastLng = newLng;

                if (isVirtualEscortActive && riskLevelGlobal === 'RED' && stationarySeconds >= 60) { 
                    if(navigator.vibrate) navigator.vibrate([500,200,500,200,800,200,800]); 
                    stationarySeconds = 0; 
                }
                processEnvironmentalIntel();
            },
            (error) => { USER_LOCATION = FALLBACK_LOCATION; processEnvironmentalIntel(); },
            { enableHighAccuracy: true }
        );
    } else {
        USER_LOCATION = FALLBACK_LOCATION;
        processEnvironmentalIntel();
    }
}

async function processEnvironmentalIntel() {
    let nodes = SENTINEL_NODES; 
    let nearestNode = null, minDistance = Infinity;
    nodes.forEach(n => {
        const d = calculateDistance(USER_LOCATION.lat, USER_LOCATION.lng, n.lat, n.lng);
        if(d < minDistance) { minDistance = d; nearestNode = n; }
    });
    if(nearestNode) updateSentinelUI(nearestNode, minDistance);
}

function updateSentinelUI(node, distanceKm) {
    document.getElementById('nearest-haven-name').innerText = node.name;
    document.getElementById('nearest-haven-dist').innerHTML = `${distanceKm.toFixed(2)}<span class="text-xl opacity-80">km</span>`;
    document.getElementById('nearest-haven-eta').innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 inline"></i> ETA ${Math.max(1, Math.round(distanceKm*6))} MINS`;

    let scoreBase = (node.reliability * 100) - (distanceKm * 15);
    let score = Math.max(0, Math.min(100, Math.round(scoreBase)));
    
    document.getElementById('probability-label').innerText = `${score}%`;
    document.getElementById('risk-bar').style.width = `${score}%`;
    
    const bodyUi = document.body;
    let lineColor = '#10b981'; // Green map path
    
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
        // High polish logic User (Red pulse), Goal (Green beacon)
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

// 4. Feature: Protocol Delta (Shadow Call)
function requestProtocolDelta(evt) {
    if(evt) evt.target.closest('button').innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-blue-300"></i> Protocol Engaged';
    
    setTimeout(() => {
        const shadowUi = document.getElementById('shadow-call-ui');
        shadowUi.style.display = 'flex';
        // Vibrate to simulate call ring
        if(navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500]);
    }, 10000);
}

function dismissShadowCall() {
    document.getElementById('shadow-call-ui').style.display = 'none';
    if(navigator.vibrate) navigator.vibrate(0);
}

function acceptShadowCall() {
    document.getElementById('shadow-call-ui').style.display = 'none';
    if(navigator.vibrate) navigator.vibrate(0);
}

// Profile panel
function toggleProfile(e) { if(e) e.stopPropagation(); document.getElementById('profile-modal').classList.remove('translate-x-full'); }
function closeProfile() { document.getElementById('profile-modal').classList.add('translate-x-full'); }

// Stealth Mode
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
