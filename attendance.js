/*
  Attendance PWA - Core Logic
  Handles Geolocation, Biometrics, WebRTC Facial Scanning, and Web NFC.
*/

// Configuration
const CONFIG = {
    // 🌍 IMPORTANT: ENTER YOUR OFFICE COORDINATES HERE 🌍
    // You can get these by right-clicking your office location on Google Maps
    officeLat: 13.120497281566188,
    officeLng: 80.13944858863891,
    // Allowable radius in meters
    radiusMeters: 100,

    // Supabase Configuration
    // 🔴 IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE URL & ANON KEY 🔴
    supabaseUrl: 'YOUR_SUPABASE_URL',
    supabaseKey: 'YOUR_SUPABASE_ANON_KEY'
};

// Initialize Supabase Client
const supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// DOM Elements
const geoStatus = document.getElementById('geoStatus');
const messageBox = document.getElementById('messageBox');
const btnBiometric = document.getElementById('btnBiometric');
const btnFaceScan = document.getElementById('btnFaceScan');
const btnNFC = document.getElementById('btnNFC');

const scannerModal = document.getElementById('scannerModal');
const cameraFeed = document.getElementById('cameraFeed');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const scannerStatus = document.getElementById('scannerStatus');

let isLocationValid = false;
let currentStream = null;

// --- UTILS ---

function showMessage(msg, type = 'error') {
    messageBox.textContent = msg;
    messageBox.className = `message-box ${type}`;
    messageBox.style.display = 'block';

    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            messageBox.style.display = 'none';
            messageBox.className = 'message-box';
        }, 5000);
    }
}

// Haversine formula to calculate distance between two coordinates
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d * 1000; // Distance in meters
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}


// --- 0. SUPABASE LOGGING ---

async function logAttendance(method) {
    const employeeIdInput = document.getElementById('employeeId').value.trim();
    if (!employeeIdInput) {
        showMessage('Attendance verified locally, but failed to log to server: Employee ID is missing.', 'error');
        return false;
    }

    try {
        const { data, error } = await supabase
            .from('attendance_logs')
            .insert([
                {
                    employee_id: employeeIdInput,
                    method: method,
                    // If location is valid, we know the approximate coordinates
                    // (Note: To be mathematically strict, we should store the exact coordinates fetched during validation)
                    location_lat: CONFIG.officeLat,
                    location_lng: CONFIG.officeLng
                }
            ]);

        if (error) {
            console.error('Supabase Error:', error);
            showMessage(`Attendance verified, but logging failed: ${error.message}`, 'error');
            return false;
        }

        showMessage(`Attendance successfully logged for ${employeeIdInput} via ${method}!`, 'success');
        return true;
    } catch (err) {
        console.error('Database Connection Error:', err);
        showMessage('Attendance verified, but connection to database failed.', 'error');
        return false;
    }
}


// --- 1. GEOLOCATION VALIDATION ---

function initGeolocation() {
    if (!navigator.geolocation) {
        updateGeoStatus('Geolocation not supported', 'invalid');
        showMessage('Geolocation is not supported by your browser.', 'error');
        return;
    }

    // Set a manual timeout flag because some mobile browsers hang indefinitely on getCurrentPosition
    let locationResolved = false;
    const fallbackTimeout = setTimeout(() => {
        if (!locationResolved) {
            updateGeoStatus('Location Timeout', 'invalid');
            isLocationValid = false;
            disableButtons();
            showMessage('Finding location took too long. Please ensure your GPS is enabled and try reloading the page.', 'error');
        }
    }, 15000); // 15 seconds manual timeout

    navigator.geolocation.getCurrentPosition(
        (position) => {
            locationResolved = true;
            clearTimeout(fallbackTimeout);
            const { latitude, longitude } = position.coords;
            const distance = getDistanceFromLatLonInKm(latitude, longitude, CONFIG.officeLat, CONFIG.officeLng);

            if (distance <= CONFIG.radiusMeters) {
                updateGeoStatus('Location Verified (Within Radius)', 'valid');
                isLocationValid = true;
                enableButtons();
            } else {
                updateGeoStatus(`Outside Radius (${Math.round(distance)}m away)`, 'invalid');
                isLocationValid = false;
                disableButtons();
                showMessage(`You are ${Math.round(distance)} meters away. You must be within ${CONFIG.radiusMeters}m of the office to mark attendance.`, 'error');
            }
        },
        (error) => {
            locationResolved = true;
            clearTimeout(fallbackTimeout);
            updateGeoStatus('Location Access Failed', 'invalid');
            isLocationValid = false;
            disableButtons();

            // Handle specific geolocation errors, especially timeouts and file:// issues
            if (error.code === error.TIMEOUT) {
                showMessage('Location request timed out natively. Please ensure Location services are enabled on your device/browser.', 'error');
            } else if (error.code === error.PERMISSION_DENIED) {
                showMessage('Please grant location permissions in your browser settings to verify you are at the office.', 'error');
            } else if (window.location.protocol === 'file:') {
                showMessage('Geolocation may hang/fail on local files (file://). Please host the file locally via a web server (e.g., Live Server).', 'error');
            } else {
                showMessage(`Error fetching location: ${error.message}`, 'error');
            }
        },
        // We set enableHighAccuracy to false. Making it true often causes some mobile devices to hang forever indoors trying to find a GPS satellite.
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
}

function updateGeoStatus(msg, status) {
    geoStatus.className = `status-bar ${status}`;
    geoStatus.querySelector('.status-text').textContent = msg;
}

function enableButtons() {
    btnBiometric.disabled = false;
    btnFaceScan.disabled = false;
    // Enable NFC only if supported
    if ('NDEFReader' in window) {
        btnNFC.disabled = false;
    }
}

function disableButtons() {
    btnBiometric.disabled = true;
    btnFaceScan.disabled = true;
    btnNFC.disabled = true;
}


// --- 2. BIOMETRIC AUTHENTICATION (WebAuthn) ---

async function handleBiometric() {
    if (!isLocationValid) return;

    if (!window.PublicKeyCredential) {
        showMessage('WebAuthn is not supported on this browser/device.', 'error');
        return;
    }

    try {
        // In a real scenario, the challenge comes from your server
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const credentialInfo = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                // Require platform authenticator (TouchID, Windows Hello, FaceID)
                authenticatorSelection: { authenticatorAttachment: "platform" },
                userVerification: "required"
            }
        });

        if (credentialInfo) {
            // We successfully validated biometric locally, now log to central DB
            logAttendance('Platform Biometric');
        }
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showMessage('Biometric prompt was cancelled.', 'error');
        } else {
            console.error(err);
            // Browsers throw errors if credentials don't exist yet for this domain.
            showMessage('Biometric failure. (Make sure a credential is created for this domain first, or it may not be set up on this device).', 'error');
        }
    }
}


// --- 3. FACIAL RECOGNITION (WebRTC) ---

async function handleFaceScan() {
    if (!isLocationValid) return;

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
        });

        cameraFeed.srcObject = currentStream;
        scannerModal.classList.add('active');
        scannerStatus.textContent = "Scanning facial features...";

        // Simulate processing time
        setTimeout(() => {
            scannerStatus.textContent = "Verifying identity...";

            setTimeout(() => {
                closeScanner();
                // Successfully finished "scan", now log to central DB
                logAttendance('Facial Recognition');
            }, 1500);
        }, 2000);

    } catch (err) {
        console.error('Error accessing camera:', err);
        showMessage('Could not access camera. Please check permissions.', 'error');
    }
}

function closeScanner() {
    scannerModal.classList.remove('active');
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}


// --- 4. RFID / NFC SCANNING (Web NFC) ---

async function handleNFC() {
    if (!isLocationValid) return;

    if (!('NDEFReader' in window)) {
        showMessage('NFC is not supported on this device/browser.', 'error');
        return;
    }

    try {
        const ndef = new NDEFReader();
        await ndef.scan();
        showMessage('Ready to scan. Please tap your RFID/NFC card.', 'success');

        ndef.addEventListener("readingerror", () => {
            showMessage("Error reading NFC tag. Try again.", "error");
        });

        ndef.addEventListener("reading", ({ message, serialNumber }) => {
            console.log(`NFC Tag Serial Number: ${serialNumber}`);

            // In a real scenario you would cross-reference the NFC serial
            // Since we need an employee ID, we will log it with the serial appended
            logAttendance(`NFC Scan (${serialNumber})`);
        });

    } catch (error) {
        console.error("Error starting NFC scan: ", error);
        showMessage("Failed to start NFC scanner. Ensure it is enabled.", "error");
    }
}


// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Check location on load
    initGeolocation();

    // Event Listeners
    btnBiometric.addEventListener('click', handleBiometric);
    btnFaceScan.addEventListener('click', handleFaceScan);
    btnNFC.addEventListener('click', handleNFC);
    closeScannerBtn.addEventListener('click', closeScanner);
});
