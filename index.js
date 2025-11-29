

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACK_LEFT, TRACK_RIGHT, COLORS } from './constants.js';
import { createTrack, createEnvironment, animatedObjects } from './assets.js';
import { Train } from './train.js';
import { setupAudio } from './audio.js';

// --- SETUP ---
const root = document.getElementById('root');

// CLEANUP
while (root.firstChild) {
    const child = root.firstChild;
    if (child.tagName === 'CANVAS') {
        const gl = child.getContext('webgl2') || child.getContext('webgl');
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    root.removeChild(child);
}

const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'mediump'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Golden Hour Sky
const GOLDEN_SKY = new THREE.Color('#FFAB76');
scene.background = GOLDEN_SKY;
scene.fog = new THREE.Fog(GOLDEN_SKY, 200, 1500);

// Create an environment map to allow metallic materials to reflect light
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.set(-140, 80, 80);

// --- CONTROLS ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-50, 0, -100);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false; // Disable mouse wheel zoom
controls.minDistance = 10;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.maxDistance = 1500;
controls.update();

// --- AUDIO SYSTEM ---
let audioEnabled = false;
let audioSystem = null;

try {
    audioSystem = setupAudio(camera);
} catch (e) {
    console.warn('Audio setup failed', e);
}

const btnSound = document.getElementById('btn-sound');
const iconSound = document.getElementById('icon-sound');
const audioHint = document.getElementById('audio-hint');

const toggleAudio = () => {
    if (!audioSystem) return;
    
    // Hide hint
    if (audioHint) audioHint.style.opacity = '0';

    const { listener, generator } = audioSystem;
    const context = listener.context;

    if (context.state === 'suspended') {
        // First user interaction: Resume context and start sounds
        context.resume().then(() => {
            console.log("Audio Context Resumed");
            generator.startAll(); // Play all tracked sounds
            audioEnabled = true;
            listener.setMasterVolume(1);
            updateSoundIcon();
        }).catch(err => console.error("Audio resume failed", err));
    } else {
        // Subsequent interactions: Toggle mute
        audioEnabled = !audioEnabled;
        listener.setMasterVolume(audioEnabled ? 1 : 0);
        updateSoundIcon();
    }
};

const updateSoundIcon = () => {
    if (iconSound) iconSound.textContent = audioEnabled ? '🔊' : '🔇';
    if (btnSound) {
        btnSound.style.backgroundColor = audioEnabled ? '#1f2937' : 'white';
        btnSound.style.color = audioEnabled ? 'white' : '#1f2937';
    }
};

if (btnSound) {
    btnSound.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAudio();
    });
}

// --- LIGHTS (Golden Hour Configuration) ---
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const hemiLight = new THREE.HemisphereLight(0x663399, 0x332200, 0.6);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

// "Sunlight" - Warm, golden, lower angle for long shadows
const sun = new THREE.DirectionalLight(0xFFD700, 3.0);
sun.position.set(300, 40, 50);
sun.castShadow = true;
sun.shadow.bias = -0.0005;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
sun.shadow.camera.left = -400;
sun.shadow.camera.right = 400;
sun.shadow.camera.top = 400;
sun.shadow.camera.bottom = -400;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0x8844AA, 0.5);
fillLight.position.set(-100, 50, -100);
scene.add(fillLight);

// --- WORLD ---
createTrack(TRACK_LEFT, scene);
createTrack(TRACK_RIGHT, scene);
createEnvironment(scene, audioSystem ? audioSystem.generator : null);

// --- TRAINS ---
const redTrain = new Train({
    id: 'red', color: COLORS.RED_TRAIN, speed: 0.35, direction: 1, initialProgress: 0.05
}, TRACK_LEFT, scene, audioSystem ? audioSystem.generator : null);

const blueTrain = new Train({
    id: 'blue', color: COLORS.BLUE_TRAIN, speed: 0.32, direction: -1, initialProgress: 0.95
}, TRACK_RIGHT, scene, audioSystem ? audioSystem.generator : null);


// --- ENVIRONMENT INITIALIZATION ---
// Ensure practical night lights are hidden for the permanent day/golden hour setting
scene.traverse((child) => {
    // Hide night lights (street lamps, car headlights)
    if (child.userData && child.userData.nightLight) {
        child.visible = false;
    }
    // Disable lit windows
    if (child.userData && child.userData.isLitWindow) {
        if (child.material) {
            child.material.emissiveIntensity = 0.0;
        }
    }
});

// --- LOOP ---
let cameraMode = 'ORBIT';
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    redTrain.update(delta);
    blueTrain.update(delta);
    
    animatedObjects.forEach(obj => {
        if (obj.update) obj.update(delta);
    });
    
    // Ensure camera up vector is standard unless overridden by specific modes (like Heli)
    if (cameraMode !== 'HELI') {
        camera.up.set(0, 1, 0);
    }
    
    if (cameraMode === 'RED') {
        const camData = redTrain.getCameraTarget();
        camera.position.copy(camData.position);
        camera.lookAt(camData.lookAt);
    } else if (cameraMode === 'BLUE') {
        const camData = blueTrain.getCameraTarget();
        camera.position.copy(camData.position);
        camera.lookAt(camData.lookAt);
    } else if (cameraMode === 'ELEVATOR') {
        const needle = animatedObjects.find(obj => obj.getPOV);
        if (needle) {
             const camData = needle.getPOV();
             camera.position.copy(camData.position);
             camera.lookAt(camData.lookAt);
        }
    } else if (cameraMode === 'TAXI') {
        const taxiObj = animatedObjects.find(obj => obj.constructor.name === 'HeroTaxi');
        if (taxiObj) {
            const camData = taxiObj.getCameraTarget();
            camera.position.copy(camData.position);
            camera.lookAt(camData.lookAt);
        }
    } else if (cameraMode === 'HELI') {
        const heliObj = animatedObjects.find(obj => obj.constructor.name === 'NewsHelicopter');
        if (heliObj && heliObj.getPOV) {
            const camData = heliObj.getPOV();
            camera.position.copy(camData.position);
            camera.lookAt(camData.lookAt);
            // Apply banking sensation by coupling camera up vector
            if (camData.up) {
                camera.up.copy(camData.up);
            }
        }
    } else {
        controls.update();
    }

    renderer.render(scene, camera);
}
animate();

// --- UI HANDLERS ---
function setMode(mode) {
    cameraMode = mode;
    
    // Adjust FOV for cinematic Heli mode (Wide Angle 12mm equiv ~110deg)
    const targetFOV = (mode === 'HELI') ? 110 : 45;
    if (camera.fov !== targetFOV) {
        camera.fov = targetFOV;
        camera.updateProjectionMatrix();
    }
    
    // When switching to ORBIT, ensure controls are enabled and zoom is disabled
    if (mode === 'ORBIT') {
        controls.enabled = true;
        controls.enableZoom = false; 
    } else {
        controls.enabled = false;
    }
    
    document.getElementById('btn-orbit').className = mode === 'ORBIT' ? 'btn btn-active-orbit' : 'btn btn-default';
    document.getElementById('btn-red').className = mode === 'RED' ? 'btn btn-active-red' : 'btn btn-default';
    document.getElementById('btn-blue').className = mode === 'BLUE' ? 'btn btn-active-blue' : 'btn btn-default';
    document.getElementById('btn-elevator').className = mode === 'ELEVATOR' ? 'btn btn-active-elevator' : 'btn btn-default';
    document.getElementById('btn-taxi').className = mode === 'TAXI' ? 'btn btn-active-taxi' : 'btn btn-default';
    document.getElementById('btn-heli').className = mode === 'HELI' ? 'btn btn-active-heli' : 'btn btn-default';
}

const btnOrbit = document.getElementById('btn-orbit');
const btnRed = document.getElementById('btn-red');
const btnBlue = document.getElementById('btn-blue');
const btnElevator = document.getElementById('btn-elevator');
const btnTaxi = document.getElementById('btn-taxi');
const btnHeli = document.getElementById('btn-heli');

if (btnOrbit) btnOrbit.addEventListener('click', () => setMode('ORBIT'));
if (btnRed) btnRed.addEventListener('click', () => setMode('RED'));
if (btnBlue) btnBlue.addEventListener('click', () => setMode('BLUE'));
if (btnElevator) btnElevator.addEventListener('click', () => setMode('ELEVATOR'));
if (btnTaxi) btnTaxi.addEventListener('click', () => setMode('TAXI'));
if (btnHeli) btnHeli.addEventListener('click', () => setMode('HELI'));

// --- ZOOM CONTROLS ---
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

const performZoom = (zoomOut) => {
    // Only zoom in ORBIT mode
    if (cameraMode !== 'ORBIT') return;
    
    const distance = camera.position.distanceTo(controls.target);
    // Factor < 1 moves in, > 1 moves out
    const factor = zoomOut ? 1.25 : 0.8; 
    
    const newDistance = THREE.MathUtils.clamp(
        distance * factor,
        controls.minDistance,
        controls.maxDistance
    );
    
    if (Math.abs(newDistance - distance) < 0.1) return;

    // Calculate direction from target to camera
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    
    // Set new camera position along that vector
    const newPos = controls.target.clone().add(direction.multiplyScalar(newDistance));
    
    camera.position.copy(newPos);
    
    // Sync OrbitControls state
    controls.update();
};

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        performZoom(false); // Zoom In
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        performZoom(true); // Zoom Out
    });
}

let resizeTimeout;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 100);
}, { passive: true });