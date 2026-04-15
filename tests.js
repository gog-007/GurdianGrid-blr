/**
 * Unit Testing Suite for GuardianGrid Core Logic.
 * Run automatically on script load to verify mathematical engine integrities.
 */
function runTests() {
    console.log("🛡️ Running GuardianGrid Enterprise Testing Suite...");
    let passed = 0;
    let failed = 0;

    function assertEqual(testName, actual, expected) {
        if (actual === expected) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName} - Expected ${expected}, got ${actual}`);
            failed++;
        }
    }

    try {
        // Test 1: Perfect reliability, 0 distance should be 100
        assertEqual("Risk Score: Perfect Node, Zero Distance", calculateRiskScore(1.0, 0), 100);

        // Test 2: 0.9 Reliability, 2km Distance -> (0.9 * 100) - (2 * 15) = 90 - 30 = 60
        assertEqual("Risk Score: Standard Sentinel Offset", calculateRiskScore(0.9, 2), 60);

        // Test 3: Far Distance drops to 0 (Lower Bound Constraint)
        assertEqual("Risk Score: Lower Bound (Max Distance)", calculateRiskScore(0.5, 100), 0);

        // Test 4: Distance calculation
        const dist = calculateDistance(12.6800, 77.4700, 12.6800, 77.4700);
        assertEqual("Distance: Same Points = 0", dist, 0);

        console.log(`🏁 Test Suite Complete: ${passed} Passed, ${failed} Failed\n--------------------`);
    } catch(err) {
        console.error("Test execution aborted:", err);
    }
}

// Execute on load
document.addEventListener('DOMContentLoaded', runTests);
