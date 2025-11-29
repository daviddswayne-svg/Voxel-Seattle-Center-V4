
import * as THREE from 'three';

// Palette
export const COLORS = {
  SKY: '#87CEEB',
  CONCRETE: '#C0C0C0',
  CONCRETE_DARK: '#808080',
  RED_TRAIN: '#E31837',
  BLUE_TRAIN: '#005696',
  GLASS: '#ADD8E6',
  WINDOW: '#1A1A1A',
  STEEL: '#555555',
  ROOF: '#DDDDDD',
  VENT: '#333333'
};

// Dimensions
export const TRACK_HEIGHT = 12;
export const PIER_SPACING = 20;
export const TRAIN_LENGTH_RATIO = 0.01; 
export const CAR_GAP = 0.0005;

// Route Definition
// Track 1 (West/Inner Track)
const LEFT_POINTS = [
  new THREE.Vector3(7.5, TRACK_HEIGHT, 80), // Shortened to 80 (Wall is at 88)
  new THREE.Vector3(7.5, TRACK_HEIGHT, 0),
  new THREE.Vector3(7.5, TRACK_HEIGHT, -100),
  new THREE.Vector3(7.5, TRACK_HEIGHT, -200),
  new THREE.Vector3(-41.8, TRACK_HEIGHT, -258.2), // Apex Turn (Inside)
  new THREE.Vector3(-100, TRACK_HEIGHT, -277.5),
  new THREE.Vector3(-150, TRACK_HEIGHT, -277.5)
];

// Track 2 (East/Outer Track)
const RIGHT_POINTS = [
  new THREE.Vector3(12.5, TRACK_HEIGHT, 80), // Shortened to 80
  new THREE.Vector3(12.5, TRACK_HEIGHT, 0),
  new THREE.Vector3(12.5, TRACK_HEIGHT, -100),
  new THREE.Vector3(12.5, TRACK_HEIGHT, -200),
  new THREE.Vector3(-38.2, TRACK_HEIGHT, -261.8), // Apex Turn (Outside)
  new THREE.Vector3(-100, TRACK_HEIGHT, -282.5),
  new THREE.Vector3(-150, TRACK_HEIGHT, -282.5)
];

export const TRACK_LEFT = new THREE.CatmullRomCurve3(LEFT_POINTS, false, 'catmullrom', 0.2);
export const TRACK_RIGHT = new THREE.CatmullRomCurve3(RIGHT_POINTS, false, 'catmullrom', 0.2);

// Traffic Loop Definition
// Road spans X = -2 to 22.
// Pillars are at X=7.5 and X=12.5.
// Safe Lanes: 
//   Northbound (Left): X < 7.5. Safe X = 2.5
//   Southbound (Right): X > 12.5. Safe X = 17.5
const TRAFFIC_POINTS = [
    // 1. Surface Southbound (5th Ave) - Right Outer Lane
    new THREE.Vector3(17.5, 0, -200),
    new THREE.Vector3(17.5, 0, 80),
    
    // 2. Straight Ramp Down (South) - Right Outer Lane
    new THREE.Vector3(17.5, -12, 140),
    
    // 3. South U-Turn (Underground) -> Switch to Left Outer Lane X=2.5
    new THREE.Vector3(17.5, -12, 150),
    new THREE.Vector3(10, -12, 170), // Wide Apex
    new THREE.Vector3(2.5, -12, 150),
    
    // 4. Tunnel Northbound (Underground) - Left Outer Lane
    new THREE.Vector3(2.5, -12, -230),
    
    // 5. North U-Turn (Underground) -> Switch back to Right Outer Lane X=17.5
    new THREE.Vector3(2.5, -12, -240),
    new THREE.Vector3(10, -12, -260), // Wide Apex
    new THREE.Vector3(17.5, -12, -245), 
    
    // 6. Straight Ramp Up (North) - Connects back to start
    new THREE.Vector3(17.5, 0, -200) 
];

export const TRAFFIC_PATH = new THREE.CatmullRomCurve3(TRAFFIC_POINTS, true, 'catmullrom', 0.05);
export const TAXI_PATH = TRAFFIC_PATH; 

export const CarType = {
  HEAD: 'HEAD',
  BODY: 'BODY',
  TAIL: 'TAIL'
};
