/**
 * Calculates mathematical distance using the Haversine formula
 * @param {number} lat1 - Point 1 Latitude
 * @param {number} lon1 - Point 1 Longitude 
 * @param {number} lat2 - Point 2 Latitude
 * @param {number} lon2 - Point 2 Longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's Radius
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Calculates the Risk Probability Score based on node structural integrity and physical distance.
 * This is decoupled from DOM manipulation for independent unit testing integrity.
 * @param {number} reliability - The node's structural reliability factor (0.0 to 1.0)
 * @param {number} distanceKm - Distance from user to node in kilometers
 * @returns {number} The integer probability score bounded between 0-100
 */
function calculateRiskScore(reliability, distanceKm) {
    let scoreBase = (reliability * 100) - (distanceKm * 15);
    return Math.max(0, Math.min(100, Math.round(scoreBase)));
}

// Ensure exports work for testing in Node without breaking the browser
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { calculateDistance, calculateRiskScore };
} else {
    window.calculateDistance = calculateDistance;
    window.calculateRiskScore = calculateRiskScore;
}
