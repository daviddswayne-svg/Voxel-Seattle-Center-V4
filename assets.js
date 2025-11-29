

import * as THREE from 'three';
import { COLORS, TRACK_HEIGHT, PIER_SPACING, CarType, TRACK_LEFT, TRACK_RIGHT, TAXI_PATH } from './constants.js';
import { createBox, createCylinder, createPlane } from './utils.js';

// Global list of objects requiring animation updates
export const animatedObjects = [];

export function clearAnimatedObjects() {
    animatedObjects.length = 0;
}

// --- TRACK ---
export function createTrack(curve, scene) {
  if (!curve || !curve.getLength) return;

  const group = new THREE.Group();

  const shape = new THREE.Shape();
  const w = 1.2, h = 2.0;
  shape.moveTo(-w/2, -h/2);
  shape.lineTo(w/2, -h/2);
  shape.lineTo(w/2, h/2);
  shape.lineTo(-w/2, h/2);
  shape.lineTo(-w/2, -h/2);

  const extrudeSettings = { steps: 200, bevelEnabled: false, extrudePath: curve };
  const beamGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const beamMat = new THREE.MeshStandardMaterial({ color: COLORS.CONCRETE, roughness: 0.8 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.castShadow = true;
  beam.receiveShadow = true;
  group.add(beam);

  const length = curve.getLength();
  const count = Math.floor(length / PIER_SPACING);
  
  for (let i = 0; i <= count; i++) {
      const t = i / count;
      const position = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      
      // Strict check for position validity to prevent TypeError
      if (!position || typeof position.x !== 'number') continue;

      const dummy = new THREE.Object3D();
      dummy.position.copy(position);
      if (tangent) {
          dummy.lookAt(position.clone().add(tangent));
      }
      
      const pierGroup = new THREE.Group();
      pierGroup.position.copy(position);
      pierGroup.rotation.y = dummy.rotation.y;

      // Calculate Ground Height (Ramp Logic) to ensure pillars touch ground
      let groundY = 0;
      const z = position.z;
      const x = position.x;
      
      // Only apply ramp depth if within the 5th Ave cut bounds
      if (x > -10 && x < 40) {
          if (z < -200 && z > -245) {
              // North Ramp Area
              const rampLen = 45; 
              const dist = z - (-245);
              const tRamp = Math.max(0, Math.min(1, dist / rampLen));
              groundY = -12 * (1 - tRamp);
          } else if (z > 80 && z < 140) {
              // South Ramp Area
              const rampLen = 60;
              const dist = z - 80;
              const tRamp = Math.max(0, Math.min(1, dist / rampLen));
              groundY = -12 * tRamp;
          }
      }

      const beamHalfHeight = 1.0;
      const capHeight = 1.5;
      const capTopY = -beamHalfHeight;
      const capCy = capTopY - capHeight / 2;
      const capBottomY = capTopY - capHeight;
      
      const topRel = capBottomY;
      const botRel = groundY - position.y; 
      const columnHeight = topRel - botRel;
      
      const columnCy = topRel - columnHeight / 2;

      if (columnHeight > 0.5) {
          createBox(1.5, columnHeight, 1.5, COLORS.CONCRETE_DARK, 0, columnCy, 0, pierGroup);
          createBox(3.0, capHeight, 2.0, COLORS.CONCRETE, 0, capCy, 0, pierGroup);
          group.add(pierGroup);
      }
  }

  scene.add(group);
}

// --- NEWS TOWER ---
const createNewsTower = (scene) => {
    const group = new THREE.Group();
    const tx = -55;
    const tz = -215;
    group.position.set(tx, 0, tz);

    const h = 45;
    const w = 18;
    const d = 18;

    createBox(w, h, d, '#888899', 0, h/2, 0, group);
    createBox(w+0.2, h-4, 4, '#113355', 0, h/2, 0, group).userData = { isLitWindow: true };
    createBox(4, h-4, d+0.2, '#113355', 0, h/2, 0, group).userData = { isLitWindow: true };

    const roofY = h + 0.5;
    createBox(w+2, 1, d+2, '#333333', 0, roofY, 0, group); 
    
    const markY = roofY + 0.51;
    const markColor = '#FFFFFF';
    createBox(1, 0.1, 8, markColor, -3, markY, 0, group); 
    createBox(1, 0.1, 8, markColor, 3, markY, 0, group); 
    createBox(6, 0.1, 1, markColor, 0, markY, 0, group); 
    
    const segs = 16;
    const rad = 7;
    for(let i=0; i<segs; i++) {
        const ang = (i/segs) * Math.PI * 2;
        const cx = Math.cos(ang) * rad;
        const cz = Math.sin(ang) * rad;
        createBox(1.5, 0.1, 0.5, '#FFCC00', cx, markY, cz, group).rotation.y = -ang;
    }

    const corners = [
        {x: -w/2, z: -d/2}, {x: w/2, z: -d/2},
        {x: w/2, z: d/2}, {x: -w/2, z: d/2}
    ];
    corners.forEach(c => {
        if (c && typeof c.x === 'number') {
            createCylinder(0.3, 0.3, 1, 8, '#333', c.x, roofY+0.5, c.z, group);
            const l = new THREE.PointLight(0xFF0000, 1, 10);
            l.position.set(c.x, roofY+1.5, c.z);
            group.add(l);
            const bulb = createBox(0.4, 0.4, 0.4, '#FF0000', c.x, roofY+1.2, c.z, group);
            bulb.material.emissive = new THREE.Color('#FF0000');
            bulb.material.emissiveIntensity = 2;
        }
    });

    scene.add(group);
    return new THREE.Vector3(tx, roofY + 1.6, tz); 
};

// --- HELICOPTER ---
class NewsHelicopter {
    constructor(scene, landingPadPos, audioGenerator) {
        this.group = new THREE.Group();
        this.landingPos = landingPadPos ? landingPadPos.clone() : new THREE.Vector3(0,0,0);
        this.group.position.copy(this.landingPos);

        // Manual Physics State
        this.isManual = false;
        this.velocity = new THREE.Vector3();
        this.angularVelocity = 0;
        this.rotorSpeed = 0;
        this.targetRotorSpeed = 0;

        // Physics Constants
        this.PHYSICS = {
            ACCEL: 60.0,
            LIFT: 40.0,
            GRAVITY: 20.0,
            FRICTION: 0.97,
            ANGULAR_ACCEL: 2.0,
            ANGULAR_FRICTION: 0.92,
            MAX_TILT: 0.4 // Max banking in radians
        };

        if (audioGenerator) {
            // Using 'ELEVATOR' buffer as a proxy for heavy machinery/rotor noise
            this.sound = audioGenerator.createPositionalAudio('ELEVATOR', 50, 1000, 0.0); 
            if (this.sound) {
                this.sound.setPlaybackRate(1.5); // Pitch up for rotor effect
                this.group.add(this.sound);
            }
        }

        const fuseColor = '#FFFFFF';
        const stripeColor = '#CC0000';
        const glassColor = '#112233';
        const metalColor = '#333333';

        const body = new THREE.Group();
        this.group.add(body);
        this.body = body; 

        createBox(2.2, 2.0, 3.5, fuseColor, 0, 1.5, 0.5, body);
        createBox(2.0, 1.8, 1.5, fuseColor, 0, 1.4, 3.0, body);
        createBox(0.8, 0.8, 5.0, fuseColor, 0, 1.8, -3.5, body);
        createBox(0.2, 1.5, 1.0, fuseColor, 0, 2.5, -5.5, body).rotation.x = 0.3;
        
        createBox(2.3, 0.3, 3.6, stripeColor, 0, 1.5, 0.5, body);
        createBox(0.9, 0.3, 5.0, stripeColor, 0, 1.8, -3.5, body);

        const glassMat = new THREE.MeshStandardMaterial({ 
            color: glassColor, transparent: true, opacity: 0.6, roughness: 0.1 
        });
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.2, 1.6), glassMat);
        windshield.position.set(0, 2.0, 2.0);
        windshield.rotation.x = -0.3;
        body.add(windshield);
        
        createBox(0.6, 0.6, 0.6, '#000000', 0, 1.8, 1.5, body);

        const skidGeo = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
        const skidMat = new THREE.MeshStandardMaterial({color: metalColor});
        const skidL = new THREE.Mesh(skidGeo, skidMat);
        skidL.rotation.x = Math.PI/2;
        skidL.position.set(1.0, 0.2, 0.5);
        body.add(skidL);
        const skidR = new THREE.Mesh(skidGeo, skidMat);
        skidR.rotation.x = Math.PI/2;
        skidR.position.set(-1.0, 0.2, 0.5);
        body.add(skidR);
        
        createBox(0.1, 1.2, 0.1, metalColor, 1.0, 0.8, 1.5, body);
        createBox(0.1, 1.2, 0.1, metalColor, -1.0, 0.8, 1.5, body);
        createBox(0.1, 1.2, 0.1, metalColor, 1.0, 0.8, -1.0, body);
        createBox(0.1, 1.2, 0.1, metalColor, -1.0, 0.8, -1.0, body);

        this.mainRotor = new THREE.Group();
        this.mainRotor.position.set(0, 3.2, 1.0);
        body.add(this.mainRotor);
        createCylinder(0.2, 0.2, 0.8, 8, metalColor, 0, -0.4, 0, this.mainRotor);
        createBox(8.0, 0.1, 0.5, '#222222', 0, 0, 0, this.mainRotor);
        createBox(0.5, 0.1, 8.0, '#222222', 0, 0, 0, this.mainRotor);

        this.tailRotor = new THREE.Group();
        this.tailRotor.position.set(0.5, 2.5, -5.5);
        this.tailRotor.rotation.z = Math.PI/2;
        body.add(this.tailRotor);
        createBox(2.5, 0.1, 0.2, '#222222', 0, 0, 0, this.tailRotor);

        this.gimbal = new THREE.Group();
        this.gimbal.position.set(0, -0.2, 4.5);
        body.add(this.gimbal);
        const camSphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshStandardMaterial({color: '#111'}));
        this.gimbal.add(camSphere);
        createCylinder(0.2, 0.15, 0.3, 8, '#111', 0, 0, 0.3, this.gimbal).rotation.x = Math.PI/2;

        scene.add(this.group);
    }

    updateHelicopterControls(delta) {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        // Loop through to find first active gamepad
        let gp = null;
        for (let i = 0; i < 4; i++) {
            if (gamepads[i] && gamepads[i].connected) {
                gp = gamepads[i];
                break;
            }
        }

        if (gp) {
            // Input Handling (Standard mapping)
            const leftStickX = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
            const leftStickY = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
            const rightStickX = Math.abs(gp.axes[2]) > 0.15 ? gp.axes[2] : 0;
            
            // Buttons can be objects or raw values
            const getBtn = (idx) => {
                if (!gp.buttons[idx]) return 0;
                return typeof gp.buttons[idx] === 'number' ? gp.buttons[idx] : gp.buttons[idx].value;
            };

            const rightTrigger = getBtn(7); // R2 / RT

            // Yaw (Rotation)
            // Apply angular acceleration to angular velocity
            this.angularVelocity -= rightStickX * this.PHYSICS.ANGULAR_ACCEL * delta;
            this.angularVelocity *= this.PHYSICS.ANGULAR_FRICTION;
            this.group.rotation.y += this.angularVelocity * delta;

            // Movement Directions relative to helicopter
            // +Z is Forward visually for the helicopter mesh (Windshield is at +Z)
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);

            // Left Stick Y: Up (-1) -> Forward, Down (+1) -> Back
            // Left Stick X: Left (-1) -> Left, Right (+1) -> Right
            this.velocity.addScaledVector(forward, -leftStickY * this.PHYSICS.ACCEL * delta);
            this.velocity.addScaledVector(right, leftStickX * this.PHYSICS.ACCEL * delta);

            // Vertical Lift vs Gravity
            this.velocity.y -= this.PHYSICS.GRAVITY * delta;
            this.velocity.y += rightTrigger * this.PHYSICS.LIFT * delta;

            // Floor Collision
            // Assuming landing pad or generic ground at Y=0 (or adjust based on scene)
            // But let's just keep it simple: no falling below Y=2
            if (this.group.position.y < 2) {
                this.group.position.y = 2;
                if (this.velocity.y < 0) this.velocity.y = 0;
            }
        }

        // Apply Velocity
        this.group.position.addScaledVector(this.velocity, delta);
        
        // Linear Friction (Air Drag)
        this.velocity.multiplyScalar(this.PHYSICS.FRICTION);

        // Visual Banking (Tilt)
        // Convert global velocity to local to determine forward/sideways speed
        const localVel = this.velocity.clone().applyQuaternion(this.group.quaternion.clone().invert());
        
        // +LocalZ velocity (Forward) -> Pitch Down (+X Rotation)
        const targetPitch = localVel.z * 0.02; 
        // +LocalX velocity (Right) -> Roll Right (-Z Rotation)
        const targetRoll = -localVel.x * 0.02;

        // Clamp tilt
        const clampedPitch = THREE.MathUtils.clamp(targetPitch, -this.PHYSICS.MAX_TILT, this.PHYSICS.MAX_TILT);
        const clampedRoll = THREE.MathUtils.clamp(targetRoll, -this.PHYSICS.MAX_TILT, this.PHYSICS.MAX_TILT);

        // Smoothly interpolate current body rotation to target
        this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, clampedPitch, delta * 3);
        this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, clampedRoll, delta * 3);
        
        // Camera Gimbal auto-look
        // Look slightly down and forward
        const lookT = this.group.position.clone().add(new THREE.Vector3(0, -50, 100).applyQuaternion(this.group.quaternion));
        this.gimbal.lookAt(lookT);
    }

    update(delta) {
        // Rotor Animation
        if (this.rotorSpeed < this.targetRotorSpeed) {
            this.rotorSpeed += delta * 10;
        } else if (this.rotorSpeed > this.targetRotorSpeed) {
            this.rotorSpeed -= delta * 5;
        }
        
        this.mainRotor.rotation.y -= this.rotorSpeed * delta * 20;
        this.tailRotor.rotation.x -= this.rotorSpeed * delta * 30;

        if (this.sound) {
            this.sound.setVolume(Math.min(1.0, this.rotorSpeed / 5));
        }

        if (this.isManual) {
            this.targetRotorSpeed = 20;
            this.updateHelicopterControls(delta);
        } else {
            // Parked State Logic
            this.targetRotorSpeed = 0;
            // Snap to landing pad if not controlled to ensure it doesn't drift
            this.group.position.copy(this.landingPos);
            this.group.rotation.set(0,0,0);
            this.body.rotation.set(0,0,0);
            this.velocity.set(0,0,0);
            this.angularVelocity = 0;
            
            // Gimbal default look
            const forward = new THREE.Vector3(0, -1, 3).applyQuaternion(this.body.quaternion).normalize();
            const targetWorld = this.group.position.clone().add(forward.multiplyScalar(200));
            this.gimbal.lookAt(targetWorld);
        }
    }
    
    getCameraTarget() {
        const pos = this.group.position.clone();
        const offset = new THREE.Vector3(0, 2, 8).applyEuler(this.group.rotation);
        const look = pos.clone().add(new THREE.Vector3(0, -10, 20).applyEuler(this.group.rotation));
        return { position: pos.add(offset), lookAt: look };
    }

    getPOV() {
        const worldPos = new THREE.Vector3();
        this.gimbal.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        this.gimbal.getWorldQuaternion(worldQuat);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
        const lookAt = worldPos.clone().add(forward.multiplyScalar(100));
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
        return { 
            position: worldPos, 
            lookAt: lookAt,
            up: up,
            fov: 110
        };
    }
}

export function createCarMesh(type, color) {
  const group = new THREE.Group();
  const isHead = type === CarType.HEAD;
  const isTail = type === CarType.TAIL;
  
  const carWidth = 2.4; 
  const carHeight = 2.4;
  const carLength = 4.5;
  
  const paintMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.1 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#444444', roughness: 0.8 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#EEEEEE', roughness: 0.1, metalness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ 
      color: COLORS.GLASS, transparent: true, opacity: 0.4, roughness: 0.0, metalness: 0.9 
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.ROOF, roughness: 0.5 });

  const skirtGeo = new THREE.BoxGeometry(carWidth, 1.2, carLength);
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, 0.4, 0); 
  group.add(skirt);
  
  const hullGeo = new THREE.BoxGeometry(carWidth, 1.0, carLength);
  const hull = new THREE.Mesh(hullGeo, paintMat);
  hull.position.set(0, 1.5, 0); 
  group.add(hull);

  const beltGeo = new THREE.BoxGeometry(carWidth + 0.05, 0.15, carLength);
  const belt = new THREE.Mesh(beltGeo, chromeMat);
  belt.position.set(0, 1.1, 0);
  group.add(belt);

  const glassStripGeo = new THREE.BoxGeometry(carWidth - 0.1, 0.8, carLength - 0.2);
  const glassStrip = new THREE.Mesh(glassStripGeo, glassMat);
  glassStrip.position.set(0, 1.8, 0);
  group.add(glassStrip);
  
  for(let z = -1.5; z <= 1.5; z+=1.5) {
     createBox(carWidth, 0.8, 0.3, color, 0, 1.8, z, group);
  }

  const roofGeo = new THREE.BoxGeometry(carWidth, 0.4, carLength);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 2.4, 0);
  group.add(roof);

  createBox(1.2, 0.2, 3.0, COLORS.VENT, 0, 2.6, 0, group);

  if (isHead || isTail) {
      const noseGroup = new THREE.Group();
      const zOffset = isHead ? 2.25 : -2.25; 
      noseGroup.position.set(0, 0, zOffset);
      
      if (isTail) noseGroup.rotation.y = Math.PI; 
      
      createBox(carWidth, 1.2, 1.2, '#444', 0, 0.4, 0.6, noseGroup);
      
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(carWidth + 0.2, 0.5, 0.4), chromeMat);
      bumper.position.set(0, 0.4, 1.2);
      noseGroup.add(bumper);

      createBox(carWidth, 0.8, 1.0, color, 0, 1.4, 0.5, noseGroup);
      
      createBox(0.2, 0.6, 0.1, '#EEE', 0, 1.4, 1.01, noseGroup);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(carWidth - 0.2, 1.1, 1.0), glassMat);
      windshield.position.set(0, 2.0, 0.4); 
      windshield.rotation.x = -0.25; 
      noseGroup.add(windshield);
      
      const cap = createBox(carWidth, 0.3, 1.2, COLORS.ROOF, 0, 2.55, 0.1, noseGroup);
      cap.rotation.x = -0.05;

      const lightColor = isHead ? 0xFFFFEE : 0xFF0000;
      const lightEmissive = isHead ? 0xFFFFEE : 0xAA0000;
      const lightMat = new THREE.MeshStandardMaterial({
          color: lightColor, 
          emissive: lightEmissive, 
          emissiveIntensity: 3.0 
      });
      
      const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16), lightMat);
      l1.rotation.x = Math.PI/2;
      l1.position.set(-0.8, 1.0, 1.0);
      noseGroup.add(l1);

      const l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16), lightMat);
      l2.rotation.x = Math.PI/2;
      l2.position.set(0.8, 1.0, 1.0);
      noseGroup.add(l2);

      group.add(noseGroup);
  } else {
      createBox(1.8, 2.0, 0.4, '#222', 0, 1.5, -2.45, group);
      createBox(2.0, 2.1, 0.1, '#111', 0, 1.5, -2.3, group);
      createBox(2.0, 2.1, 0.1, '#111', 0, 1.5, -2.6, group);
  }
  
  return group;
}

const createTicketMachine = (x, y, z, rotY=0, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    createBox(0.8, 2, 0.6, '#004488', 0, 1, 0, g);
    const screen = createPlane(0.5, 0.4, '#AADDFF', 0, 1.5, 0.31, 0, g);
    screen.material.emissive = new THREE.Color('#AADDFF');
    screen.material.emissiveIntensity = 0.6;
    createPlane(0.4, 0.1, '#111', 0, 1.1, 0.31, 0, g);
    createBox(0.8, 0.2, 0.6, '#C0C0C0', 0, 2.1, 0, g);
    if(parent) parent.add(g);
    return g;
};

const createBench = (x, y, z, rotY=0, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    createBox(3, 0.1, 1, '#8B4513', 0, 0.5, 0, g);
    createBox(0.2, 0.5, 0.8, '#333', -1.2, 0.25, 0, g);
    createBox(0.2, 0.5, 0.8, '#333', 1.2, 0.25, 0, g);
    createBox(3, 0.5, 0.1, '#8B4513', 0, 0.8, -0.4, g);
    if(parent) parent.add(g);
    return g;
};

const createTurnstile = (x, y, z, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    createBox(0.2, 1, 1, '#C0C0C0', 0, 0.5, 0, g);
    createBox(1, 0.1, 0.1, 'red', 0.5, 0.8, 0, g);
    if(parent) parent.add(g);
}

// --- TRAFFIC SYSTEM ---
class TrafficCar {
  constructor(curve, initialProgress, speed, color, audioGenerator) {
    this.curve = curve;
    this.progress = initialProgress;
    this.speed = speed; 
    this.color = color;
    
    this.group = new THREE.Group();
    
    if (audioGenerator) {
        const sound = audioGenerator.createPositionalAudio('TRAFFIC', 30, 300, 0.3);
        if (sound) this.group.add(sound);
    }

    createBox(2.2, 1.0, 4.5, color, 0, 1.0, 0, this.group);
    createBox(2.0, 0.8, 2.5, '#333', 0, 1.9, -0.2, this.group); 
    createBox(2.1, 0.15, 2.6, color, 0, 2.3, -0.2, this.group); 
    
    const wCol = '#222';
    const wY = 0.4;
    const wOffX = 1.1;
    const wOffZ = 1.2;
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: wCol });
    
    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.position.set(wOffX, wY, wOffZ); w1.rotation.z = Math.PI/2; this.group.add(w1);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.position.set(-wOffX, wY, wOffZ); w2.rotation.z = Math.PI/2; this.group.add(w2);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.position.set(wOffX, wY, -1.5); w3.rotation.z = Math.PI/2; this.group.add(w3);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.position.set(-wOffX, wY, -1.5); w4.rotation.z = Math.PI/2; this.group.add(w4);

    const head = createBox(1.8, 0.2, 0.1, '#FFF', 0, 1.0, 2.26, this.group);
    head.material.emissive = new THREE.Color('#FFFFE0');
    const tail = createBox(1.8, 0.2, 0.1, '#F00', 0, 1.0, -2.26, this.group);
    tail.material.emissive = new THREE.Color('#AA0000');
  }

  update(delta) {
    const LOOP_SPEED_SCALE = 0.0005; 
    this.progress += this.speed * delta * LOOP_SPEED_SCALE;
    if (this.progress > 1) this.progress -= 1;

    // Guard against potential undefined curve points during initialization or reload
    if (!this.curve || !this.curve.getPointAt) return;

    const pos = this.curve.getPointAt(this.progress);
    const nextPos = this.curve.getPointAt((this.progress + 0.005) % 1);

    if (pos && nextPos && typeof pos.x === 'number') {
        this.group.position.copy(pos);
        const m = new THREE.Matrix4();
        m.lookAt(pos, nextPos, new THREE.Vector3(0, 1, 0));
        this.group.quaternion.setFromRotationMatrix(m);
    }
  }
}

class TrafficSystem {
    constructor(scene, audioGenerator) {
        this.cars = [];
        const colors = ['#A93226', '#1F618D', '#117A65', '#D68910', '#D35400', '#7F8C8D', '#2E4053', '#F1C40F', '#E74C3C'];
        const SPEED_BASE = 60; 
        const NUM_CARS = 20;

        for(let i=0; i<NUM_CARS; i++) {
             const t = i / NUM_CARS;
             const color = colors[Math.floor(Math.random() * colors.length)];
             const speed = SPEED_BASE; 
             const car = new TrafficCar(TAXI_PATH, t, speed, color, audioGenerator);
             scene.add(car.group);
             this.cars.push(car);
        }
    }

    update(delta) {
        this.cars.forEach(car => car.update(delta));
    }
}

export class HeroTaxi {
    constructor(scene, audioGenerator) {
        this.group = new THREE.Group();
        this.curve = TAXI_PATH;
        this.progress = 0.85; 
        this.speed = 70; 
        this.isHeroTaxi = true; 
        
        const taxiColor = '#FFD700'; 
        
        createBox(2.2, 1.0, 4.5, taxiColor, 0, 1.0, 0, this.group);
        createBox(2.0, 0.8, 2.5, '#333', 0, 1.9, -0.2, this.group); 
        createBox(2.1, 0.15, 2.6, taxiColor, 0, 2.3, -0.2, this.group); 

        for(let i=0; i<8; i++) {
            const z = -2 + (i*0.5);
            const col = i % 2 === 0 ? '#000' : '#FFF';
            createBox(0.1, 0.2, 0.4, col, 1.11, 1.0, z, this.group);
            createBox(0.1, 0.2, 0.4, col, -1.11, 1.0, z, this.group);
        }

        const sign = createBox(0.8, 0.3, 0.4, '#FFFFE0', 0, 2.5, 0.5, this.group);
        sign.material.emissive = new THREE.Color('#FFFFE0');
        sign.material.emissiveIntensity = 0.5;
        
        const wCol = '#222';
        const wY = 0.4;
        const wOffX = 1.1;
        const wOffZ = 1.2;
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: wCol });
        const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.position.set(wOffX, wY, wOffZ); w1.rotation.z = Math.PI/2; this.group.add(w1);
        const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.position.set(-wOffX, wY, wOffZ); w2.rotation.z = Math.PI/2; this.group.add(w2);
        const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.position.set(wOffX, wY, -1.5); w3.rotation.z = Math.PI/2; this.group.add(w3);
        const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.position.set(-wOffX, wY, -1.5); w4.rotation.z = Math.PI/2; this.group.add(w4);

        const head = createBox(1.8, 0.2, 0.1, '#FFF', 0, 1.0, 2.26, this.group);
        head.material.emissive = new THREE.Color('#FFFFE0');
        const tail = createBox(1.8, 0.2, 0.1, '#F00', 0, 1.0, -2.26, this.group);
        tail.material.emissive = new THREE.Color('#AA0000');

        this.cameraRig = new THREE.Object3D();
        this.cameraRig.position.set(0, 3.0, 0.5);
        this.group.add(this.cameraRig);

        this.viewTarget = new THREE.Object3D();
        this.viewTarget.position.set(0, 1.0, 50); 
        this.group.add(this.viewTarget);

        if (audioGenerator) {
            const sound = audioGenerator.createPositionalAudio('TRAFFIC', 30, 300, 0.8);
            if (sound) this.group.add(sound);
        }

        scene.add(this.group);
    }

    update(delta) {
        const LOOP_SPEED_SCALE = 0.0005; 
        this.progress += this.speed * delta * LOOP_SPEED_SCALE;
        if (this.progress > 1) this.progress -= 1;

        if (!this.curve || !this.curve.getPointAt) return;

        const pos = this.curve.getPointAt(this.progress);
        const nextPos = this.curve.getPointAt((this.progress + 0.005) % 1);

        if (pos && nextPos && typeof pos.x === 'number') {
            this.group.position.copy(pos);
            const m = new THREE.Matrix4();
            m.lookAt(pos, nextPos, new THREE.Vector3(0, 1, 0));
            this.group.quaternion.setFromRotationMatrix(m);
        }
    }

    getCameraTarget() {
        const eyePos = new THREE.Vector3();
        const lookPos = new THREE.Vector3();
        this.cameraRig.getWorldPosition(eyePos);
        this.viewTarget.getWorldPosition(lookPos);
        return { position: eyePos, lookAt: lookPos };
    }
}

const createTunnelGeometry = (scene) => {
    const allPoints = TAXI_PATH.getSpacedPoints(600);
    const tunnelPoints = allPoints.filter(p => p.y < -0.1 || (p.z > 70 && p.z < 150) || (p.z < -190 && p.z > -260));
    
    if (tunnelPoints.length < 2) return;

    const tunnelCurve = new THREE.CatmullRomCurve3(tunnelPoints);
    
    const w = 14; 
    const h = 9; 
    const shape = new THREE.Shape();
    shape.moveTo(-w/2, 0); 
    shape.lineTo(w/2, 0);
    shape.lineTo(w/2, h);
    shape.lineTo(-w/2, h);
    shape.lineTo(-w/2, 0);

    const extrudeSettings = { steps: 300, bevelEnabled: false, extrudePath: tunnelCurve };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    const mat = new THREE.MeshStandardMaterial({ 
        color: '#555555', 
        side: THREE.DoubleSide, 
        roughness: 0.9 
    });
    const tunnel = new THREE.Mesh(geo, mat);
    scene.add(tunnel);

    const lightSpacing = 40;
    const pathLen = tunnelCurve.getLength();
    const numLights = Math.floor(pathLen / lightSpacing);
    
    for(let i=0; i<=numLights; i++) {
        const t = i / numLights;
        const p = tunnelCurve.getPointAt(t);
        const tan = tunnelCurve.getTangentAt(t);
        
        if (p && typeof p.x === 'number' && p.y < -2 && tan) { 
            const ceilingPos = p.clone().add(new THREE.Vector3(0, h - 0.5, 0));
            
            const fixture = createBox(2, 0.2, 4, '#333', ceilingPos.x, ceilingPos.y, ceilingPos.z);
            fixture.lookAt(ceilingPos.clone().add(tan));
            
            const strip = createBox(1.5, 0.1, 3, '#FFAA00', 0, -0.16, 0, fixture);
            strip.material.emissive = new THREE.Color('#FFAA55');
            strip.material.emissiveIntensity = 2.0;
            scene.add(fixture);

            const pl = new THREE.PointLight('#FFAA00', 40, 40); 
            pl.position.copy(ceilingPos).add(new THREE.Vector3(0, -1, 0));
            scene.add(pl);
        }
    }
}

const createTunnelSignage = (scene) => {
    const createSignPost = (x, z, rotY) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotY;
        createCylinder(0.1, 0.1, 4, 8, '#333', 0, 2, 0, group);
        const board = createBox(3, 1.5, 0.1, '#006633', 0, 3.5, 0, group);
        createBox(2.5, 0.1, 0.15, '#FFF', 0, 3.8, 0, group);
        createBox(2.0, 0.1, 0.15, '#FFF', 0, 3.5, 0, group);
        createBox(2.5, 0.1, 0.15, '#FFF', 0, 3.2, 0, group);
        scene.add(group);
    }
    createSignPost(24, 80, -Math.PI/2);
    createSignPost(-4, -200, Math.PI/2);
}

// --- RESTORED PAVEMENT ---
export const createFifthAvePavement = (scene) => {
    const voxels = [];
    const voxelSize = 0.5;
    
    const C_ASPHALT_BASE = new THREE.Color('#252525');
    const C_ASPHALT_NOISE = new THREE.Color('#2A2A2A');
    const C_MARKING_WHITE = new THREE.Color('#FFFFFF'); 
    const C_MARKING_YELLOW = new THREE.Color('#FFC000'); 
    const C_SIDEWALK_BASE = new THREE.Color('#AAAAAA');
    const C_SIDEWALK_LIGHT = new THREE.Color('#BBBBBB');
    const C_SIDEWALK_DARK = new THREE.Color('#999999');
    const C_CURB = new THREE.Color('#888888');
    const C_CURB_RED = new THREE.Color('#CC2222');
    const C_PLANTER_WALL = new THREE.Color('#8B4513'); 
    const C_SOIL = new THREE.Color('#3d2817');
    const C_GRASS = new THREE.Color('#448844');
    const C_METAL_GRATE = new THREE.Color('#111111');
    const C_MANHOLE = new THREE.Color('#3E2723'); 

    const addVoxel = (x, y, z, color) => {
        voxels.push({x, y, z, color});
    };

    const minX = -10;
    const maxX = 30;
    const minZ = -230;
    const maxZ = 100;

    const roadMinX = -2;
    const roadMaxX = 22;

    for (let z = maxZ; z >= minZ; z -= voxelSize) {
        let ySurface = 0;
        let isRamp = false;

        if (z < -200 && z > -245) {
            isRamp = true;
            const rampLen = 45; 
            const dist = z - (-245);
            const t = dist / rampLen;
            ySurface = -12 * (1 - t); 
        } 
        else if (z > 80 && z < 140) {
             isRamp = true;
             const rampLen = 60;
             const dist = z - 80;
             const t = Math.min(1, dist / rampLen); 
             ySurface = -12 * t;
        }

        const sidewalkH = 0.25;

        for (let x = minX; x <= maxX; x += voxelSize) {
            const isRoad = (x >= roadMinX && x <= roadMaxX);
            const isLeftSidewalk = (x < roadMinX);
            const isRightSidewalk = (x > roadMaxX);
            
            let yBase = ySurface;
            
            if (isRamp && !isRoad) yBase = 0; 

            if (isRoad) {
                let col = ((Math.floor(x*2) + Math.floor(z*2)) % 7 === 0) ? C_ASPHALT_NOISE : C_ASPHALT_BASE;

                if (Math.abs(x - 9.5) < 0.1 || Math.abs(x - 10.5) < 0.1) {
                    col = C_MARKING_YELLOW;
                }
                
                const isDividerX = (Math.abs(x - 2.0) < 0.1 || Math.abs(x - 6.0) < 0.1 || Math.abs(x - 14.0) < 0.1 || Math.abs(x - 18.0) < 0.1);
                if (isDividerX && Math.abs(z % 12) < 3) col = C_MARKING_WHITE;

                const cwZ = Math.abs(z % 40); 
                if (Math.abs(cwZ - 6) < 0.4) col = C_MARKING_WHITE; 

                if (cwZ < 3.0) {
                    if (Math.floor(x) % 2 === 0) col = C_MARKING_WHITE;
                }
                
                if (Math.abs(z % 50) < 1.0) {
                    if (Math.abs(x - 4) < 0.6 || Math.abs(x - 16) < 0.6) col = C_MANHOLE;
                }

                if (Math.abs(z % 20) < 1.0) {
                    if (Math.abs(x - roadMinX) < 1.0 || Math.abs(x - roadMaxX) < 1.0) col = C_METAL_GRATE;
                }

                addVoxel(x, yBase, z, col);
            }

            if (isLeftSidewalk || isRightSidewalk) {
                let ySidewalk = yBase + sidewalkH;
                
                const isEdge = (isLeftSidewalk && x >= roadMinX - 0.5) || (isRightSidewalk && x <= roadMaxX + 0.5);
                
                if (isEdge && yBase < -0.5) { 
                    for (let fy = yBase; fy < 0; fy += voxelSize) {
                        addVoxel(x, fy, z, C_SIDEWALK_DARK);
                    }
                    ySidewalk = 0 + sidewalkH; 
                }

                const isCurb = (isLeftSidewalk && x >= roadMinX - 0.5) || (isRightSidewalk && x <= roadMaxX + 0.5);
                
                if (isCurb) {
                    let curbCol = C_CURB;
                    if (Math.abs(z % 40) < 8) curbCol = C_CURB_RED;
                    addVoxel(x, ySidewalk, z, curbCol);
                } else {
                    const tx = Math.floor(x);
                    const tz = Math.floor(z);
                    let tileCol = ((tx + tz) % 2 === 0) ? C_SIDEWALK_BASE : C_SIDEWALK_LIGHT;
                    
                    const sidewalkCenter = isLeftSidewalk ? -6 : 26;
                    const planterZ = z % 25;
                    
                    const inPlanterZone = (Math.abs(planterZ) < 2.5 && Math.abs(x - sidewalkCenter) < 1.5);
                    
                    if (inPlanterZone) {
                        const isWall = (Math.abs(planterZ) > 2.0 || Math.abs(x - sidewalkCenter) > 1.0);
                        
                        if (isWall) {
                            addVoxel(x, ySidewalk, z, C_PLANTER_WALL); 
                            addVoxel(x, ySidewalk + voxelSize, z, C_PLANTER_WALL); 
                        } else {
                            addVoxel(x, ySidewalk, z, C_PLANTER_WALL); 
                            addVoxel(x, ySidewalk + voxelSize, z, C_SOIL); 
                            addVoxel(x, ySidewalk + voxelSize*1.5, z, C_GRASS); 
                            
                            if (Math.random() > 0.8) {
                                 addVoxel(x, ySidewalk + voxelSize*2.5, z, new THREE.Color('#33AA33'));
                            }
                        }
                    } else {
                        addVoxel(x, ySidewalk, z, tileCol);
                        
                        if (Math.abs((z+12.5) % 25) < 0.5 && Math.abs(x - sidewalkCenter) < 0.5) {
                             addVoxel(x, ySidewalk + voxelSize, z, C_SIDEWALK_DARK);
                        }
                    }
                }
            }
        }
    }
    
    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
    
    const dummy = new THREE.Object3D();
    
    voxels.forEach((v, i) => {
        if (v && typeof v.x === 'number') {
            dummy.position.set(v.x, v.y, v.z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, v.color);
        }
    });
    
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
};

const createDetailedBrickBuilding = (x, z, floors, width, depth, color, scene) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const floorHeight = 4;
    createBox(width, 5, depth, '#2F2F2F', 0, 2.5, 0, group);
    createBox(width - 2, 3.5, depth + 0.1, '#FFAA55', 0, 2.5, 0, group).material.emissive = new THREE.Color('#553311');
    createBox(width - 1.5, 0.5, depth + 0.2, '#111', 0, 4.5, 0, group); 

    const winsX = Math.floor(width / 4);
    const numWindows = (floors - 1) * winsX; 

    if (numWindows > 0) {
        const frameGeo = new THREE.BoxGeometry(2.2, 2.2, depth + 0.2);
        const frameMat = new THREE.MeshStandardMaterial({ color: '#333' });
        
        const glassGeo = new THREE.BoxGeometry(1.8, 1.8, depth + 0.3);
        const glassMat = new THREE.MeshStandardMaterial({ color: '#112233', roughness: 0.2 });
        const litGlassMat = new THREE.MeshStandardMaterial({ color: '#FFFFEE', emissive: '#FFFFEE', emissiveIntensity: 0.0 });
        
        const sillGeo = new THREE.BoxGeometry(2.4, 0.4, depth + 0.4);
        const sillMat = new THREE.MeshStandardMaterial({ color: '#222' });
        const lintelGeo = new THREE.BoxGeometry(2.4, 0.6, depth + 0.4);
        const lintelMat = new THREE.MeshStandardMaterial({ color: color });
        lintelMat.lightMapIntensity = 0.5;

        const mFrame = [], mSill = [], mLintel = [], mDark = [], mLit = [];
        const dummy = new THREE.Object3D();

        for (let f = 1; f < floors; f++) {
            const y = 5 + (f - 1) * 4;
            const h = floorHeight;
            createBox(width, h, depth, color, 0, y + h/2, 0, group);
            createBox(width + 0.5, 0.5, depth + 0.5, '#554433', 0, y + h, 0, group);

            for (let i = 0; i < winsX; i++) {
                const wx = (i - (winsX - 1) / 2) * 4;
                
                dummy.position.set(wx, y + h/2, 0); dummy.updateMatrix();
                mFrame.push(dummy.matrix.clone());
                
                dummy.position.set(wx, y + 0.5, 0); dummy.updateMatrix();
                mSill.push(dummy.matrix.clone());
                
                dummy.position.set(wx, y + h - 0.8, 0); dummy.updateMatrix();
                mLintel.push(dummy.matrix.clone());
                
                dummy.position.set(wx, y + h/2, 0); dummy.updateMatrix();
                if (Math.random() < 0.25) {
                    mLit.push(dummy.matrix.clone());
                } else {
                    mDark.push(dummy.matrix.clone());
                }
            }
        }
        
        const fill = (geo, mat, mats) => {
            if (mats.length === 0) return;
            const m = new THREE.InstancedMesh(geo, mat, mats.length);
            mats.forEach((mx, i) => m.setMatrixAt(i, mx));
            m.castShadow = true; m.receiveShadow = true;
            group.add(m);
            return m;
        };

        fill(frameGeo, frameMat, mFrame);
        fill(sillGeo, sillMat, mSill);
        fill(lintelGeo, lintelMat, mLintel);
        fill(glassGeo, glassMat, mDark);
        
        const litMesh = fill(glassGeo, litGlassMat, mLit);
        if (litMesh) litMesh.userData = { isLitWindow: true };
    }

    const topY = 5 + (floors-1)*floorHeight;
    createBox(width + 1.2, 1.5, depth + 1.2, '#332211', 0, topY + 0.75, 0, group);
    createBox(width-2, 1, depth-2, '#222', 0, topY+0.1, 0, group);
    createBox(4, 3, 4, '#555', 2, topY + 2.5, 2, group);
    createCylinder(1.5, 1.5, 4, 16, '#8B4513', -3, topY + 2, -3, group); 
    createCylinder(2, 2, 3, 16, '#8B4513', -3, topY + 4.5, -3, group); 

    for(let f=1; f<floors; f++) {
        const y = 5 + (f-1)*floorHeight;
        createBox(width/2 + 1, 0.2, 4, '#111', width/4, y + 0.5, depth/2 + 0.6, group); 
        const ladder = createBox(1, 5, 0.2, '#111', width/4 + 1, y + 2.5, depth/2 + 2.5, group);
        ladder.rotation.z = -0.3;
    }

    if(scene) scene.add(group);
};

const createDetailedGlassTower = (x, z, floors, width, color, scene) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    
    const floorHeight = 5;
    const totalHeight = floors * floorHeight;

    createBox(width-4, totalHeight, width-4, '#444', 0, totalHeight/2, 0, group);

    const roomCount = Math.floor(floors * 2);
    const roomGeo = new THREE.BoxGeometry(width - 5, floorHeight - 1, width - 5);
    const roomMat = new THREE.MeshStandardMaterial({ color: '#FFFFEE', emissive: '#FFFFEE', emissiveIntensity: 0.0 });
    const roomMesh = new THREE.InstancedMesh(roomGeo, roomMat, roomCount);
    roomMesh.userData = { isLitWindow: true };
    
    const dummy = new THREE.Object3D();
    let idx = 0;
    for(let i=0; i<roomCount; i++) {
        if (Math.random() > 0.4) continue;
        const f = Math.floor(Math.random() * floors);
        const y = f * floorHeight + floorHeight/2;
        dummy.position.set(0, y, 0);
        dummy.scale.set(0.8+Math.random()*0.2, 0.8, 0.8+Math.random()*0.2);
        dummy.updateMatrix();
        roomMesh.setMatrixAt(idx++, dummy.matrix);
    }
    roomMesh.count = idx;
    roomMesh.instanceMatrix.needsUpdate = true;
    group.add(roomMesh);

    const glassMat = new THREE.MeshStandardMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 0.6, 
        roughness: 0.1, 
        metalness: 0.8 
    });
    
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight, width), glassMat);
    glass.position.y = totalHeight/2;
    group.add(glass);

    for(let f=0; f<=floors; f++) {
        const y = f * floorHeight;
        createBox(width+0.4, 0.5, width+0.4, '#222', 0, y, 0, group); 
    }
    
    const colW = 1.5;
    createBox(colW, totalHeight, colW, '#222', width/2, totalHeight/2, width/2, group);
    createBox(colW, totalHeight, colW, '#222', -width/2, totalHeight/2, width/2, group);
    createBox(colW, totalHeight, colW, '#222', width/2, totalHeight/2, -width/2, group);
    createBox(colW, totalHeight, colW, '#222', -width/2, totalHeight/2, -width/2, group);
    
    const numMullions = 3;
    for(let m=1; m<numMullions; m++) {
        const xOff = -width/2 + (width/numMullions)*m;
        createBox(0.3, totalHeight, 0.3, '#333', xOff, totalHeight/2, width/2+0.1, group);
        createBox(0.3, totalHeight, 0.3, '#333', xOff, totalHeight/2, -width/2-0.1, group);
    }

    createCylinder(0.5, 0.1, 12, 8, '#888', 0, totalHeight + 6, 0, group); 
    createBox(width-2, 3, width-2, '#222', 0, totalHeight + 1.5, 0, group); 
    const beacon = createBox(0.5, 0.5, 0.5, 'red', 0, totalHeight + 12, 0, group);
    beacon.material.emissive = new THREE.Color('red');
    beacon.material.emissiveIntensity = 2;

    if(scene) scene.add(group);
}

const createBrutalistBlock = (x, z, height, width, scene) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    createBox(width, height, width, '#999', 0, height/2, 0, group);
    const rows = Math.floor(height / 6);
    for(let i=1; i<rows; i++) {
        const y = i * 6;
        createBox(width+0.2, 2, width+0.2, '#111', 0, y, 0, group);
        for(let k=0; k<5; k++) {
             createBox(1, 6, 1.5, '#999', (k-2)*(width/5), y, width/2, group);
        }
    }
    if(scene) scene.add(group);
}

const createStackedApartments = (x, z, scene) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    createBox(10, 60, 10, '#333', 0, 30, 0, group);
    const numBlocks = 8;
    for(let i=0; i<numBlocks; i++) {
        const y = 5 + (i * 7);
        const w = 12 + Math.random() * 4;
        const d = 12 + Math.random() * 4;
        const xOff = (Math.random() - 0.5) * 4;
        const zOff = (Math.random() - 0.5) * 4;
        const color = i % 2 === 0 ? '#EFEFEF' : '#DDDDDD';
        createBox(w, 6, d, color, xOff, y + 3, zOff, group);
        createBox(w + 0.2, 2, d + 0.2, '#222', xOff, y + 4, zOff, group);
        const bx = xOff + (Math.random() > 0.5 ? w/2 : -w/2);
        createBox(2, 1, d * 0.8, '#555', bx, y + 1, zOff, group); 
        
        const win = createBox(2, 2, 0.2, '#88CCFF', bx, y + 2, zOff + d/2 - 0.5, group);
        if (Math.random() > 0.5) {
             win.material = win.material.clone();
             win.material.transparent = true;
             win.userData = { isLitWindow: true };
        } else {
             win.material.transparent = true;
        }
    }
    if (scene) scene.add(group);
};

const createArmory = (x, y, z, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const width = 80;
    const depth = 50;
    const height = 18;
    const beige = '#D8C8B8';
    createBox(width, height, depth, beige, 0, height/2, 0, g);
    const roofH = 8;
    createBox(width - 4, 1, depth - 4, '#555', 0, height + 0.5, 0, g);
    createBox(width/2, 4, depth/2, beige, 0, height + 3, 0, g);
    createBox(width/2 + 1, 0.5, depth/2 + 1, '#444', 0, height + 5.25, 0, g);
    const winsX = 10;
    const winsZ = 6;
    for(let i=0; i<winsX; i++) {
        const wx = (i - (winsX-1)/2) * 6;
        createBox(3, 10, 0.5, '#222', wx, height/2, depth/2 + 0.1, g);
        createBox(3, 10, 0.5, '#222', wx, height/2, -depth/2 - 0.1, g);
    }
    for(let i=0; i<winsZ; i++) {
        const wz = (i - (winsZ-1)/2) * 6;
        createBox(0.5, 10, 3, '#222', -width/2 - 0.1, height/2, wz, g);
        createBox(0.5, 10, 3, '#222', width/2 + 0.1, height/2, wz, g);
    }
    createBox(20, 3, 1, '#8B0000', 0, height - 3, depth/2 + 0.5, g);
    parent.add(g);
};

const createMuralAmphitheater = (x, y, z, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = -Math.PI / 3;

    const muralGroup = new THREE.Group();
    muralGroup.position.z = -15;
    g.add(muralGroup);

    const radius = 50;
    const height = 24;
    const segments = 20;
    const arc = Math.PI / 2.5;
    
    const colors = ['#8B2E2E', '#2F4F4F', '#A9A9A9', '#DCDCDC', '#1C1C1C', '#D4AF37']; 

    for(let i=0; i<=segments; i++) {
        const pct = i/segments;
        const angle = -arc/2 + pct * arc;
        const xPos = Math.sin(angle) * radius;
        const zPos = Math.cos(angle) * radius - radius;
        
        const segWidth = (arc * radius) / segments + 0.5;
        
        const column = new THREE.Group();
        column.position.set(xPos, 0, zPos);
        column.rotation.y = angle;
        
        createBox(segWidth, height, 2, '#999', 0, height/2, 0, column);
        
        const numTiles = 8;
        const tileH = height / numTiles;
        for(let k=0; k<numTiles; k++) {
            const col = colors[Math.floor(Math.random() * colors.length)];
            const depth = 0.5 + Math.random() * 0.5;
            createBox(segWidth * 0.95, tileH * 0.95, depth, col, 0, k*tileH + tileH/2, 1, column);
        }
        
        muralGroup.add(column);
    }
    
    createBox(3, height, 3, '#444', -20, height/2, -5, muralGroup);
    createBox(3, height, 3, '#444', 20, height/2, -5, muralGroup);

    const stageW = 40;
    const stageD = 20;
    const stageH = 3;
    const stage = new THREE.Group();
    stage.position.set(0, 0, 10);
    g.add(stage);
    
    createBox(stageW, stageH, stageD, '#222', 0, stageH/2, 0, stage);
    createBox(stageW-2, 0.2, stageD-2, '#111', 0, stageH + 0.1, 0, stage);
    
    const trussColor = '#111';
    createBox(1, 16, 1, trussColor, -18, 8, -8, stage);
    createBox(1, 16, 1, trussColor, 18, 8, -8, stage);
    createBox(1, 16, 1, trussColor, -18, 8, 8, stage);
    createBox(1, 16, 1, trussColor, 18, 8, 8, stage);
    createBox(38, 1, 18, trussColor, 0, 16, 0, stage);
    
    const lightBar = createBox(30, 0.5, 0.5, '#FFF', 0, 15.5, 8, stage);
    lightBar.material.emissive = new THREE.Color('#FFFFE0');
    lightBar.material.emissiveIntensity = 2;

    createBox(60, 0.5, 15, '#224466', 0, 0.2, 0, g);

    const lawnGroup = new THREE.Group();
    lawnGroup.position.set(0, 0, 40);
    g.add(lawnGroup);
    
    const lawnW = 80;
    const lawnL = 80;
    const slope = -0.15;
    
    const steps = 20;
    const stepL = lawnL / steps;
    const stepH = (Math.tan(Math.abs(slope)) * lawnL) / steps;
    
    for(let i=0; i<steps; i++) {
        const yPos = i * stepH;
        const zPos = i * stepL;
        const grass = createBox(lawnW, stepH + 1, stepL + 0.5, '#3A5F0B', 0, yPos, zPos, lawnGroup);
        
        if (Math.random() > 0.6) {
             const px = (Math.random() - 0.5) * (lawnW - 5);
             createBox(1.5, 1.5, 1.5, colors[Math.floor(Math.random()*colors.length)], px, yPos + stepH/2 + 0.75, zPos, lawnGroup);
        }
    }
    
    const wallL = Math.sqrt(lawnL*lawnL + (lawnL*Math.tan(Math.abs(slope)))**2);
    const wallLeft = createBox(2, 4, wallL, '#888', -lawnW/2 - 1, (steps*stepH)/2, lawnL/2, lawnGroup);
    wallLeft.rotation.x = slope;
    const wallRight = createBox(2, 4, wallL, '#888', lawnW/2 + 1, (steps*stepH)/2, lawnL/2, lawnGroup);
    wallRight.rotation.x = slope;

    parent.add(g);
};

const createChihulyGarden = (x, y, z, parent) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const ghW = 20;
    const ghH = 25;
    const ghD = 40;
    const frameColor = '#333';
    for(let i=0; i<6; i++) {
        const zPos = (i - 2.5) * 7;
        const arch = new THREE.Group();
        arch.position.z = zPos;
        createBox(1, 15, 1, frameColor, -ghW/2, 7.5, 0, arch);
        createBox(1, 15, 1, frameColor, ghW/2, 7.5, 0, arch);
        const beamL = createBox(1, 12, 1, frameColor, -ghW/4, 19, 0, arch);
        beamL.rotation.z = -0.5;
        const beamR = createBox(1, 12, 1, frameColor, ghW/4, 19, 0, arch);
        beamR.rotation.z = 0.5;
        g.add(arch);
    }
    const glass = createBox(ghW-1, ghH, ghD-1, '#ADD8E6', 0, ghH/2, 0, g);
    glass.material.transparent = true;
    glass.material.opacity = 0.3;
    const sculpG = new THREE.Group();
    sculpG.position.y = 18;
    for(let i=0; i<30; i++) {
        const t = i/30;
        const sx = Math.sin(t * Math.PI * 4) * 4;
        const sz = (t - 0.5) * 30;
        const sy = Math.cos(t * Math.PI * 2) * 2;
        const color = t < 0.3 ? '#FF4500' : (t < 0.6 ? '#FFA500' : '#FFFF00'); 
        createBox(1.5, 1.5, 1.5, color, sx, sy, sz, sculpG).rotation.set(Math.random(), Math.random(), Math.random());
    }
    g.add(sculpG);
    for(let i=0; i<20; i++) {
        const rx = (Math.random() - 0.5) * 50;
        const rz = (Math.random() - 0.5) * 50;
        if (Math.abs(rx) < 12 && Math.abs(rz) < 22) continue;
        const h = 5 + Math.random() * 8;
        const col = Math.random() > 0.5 ? '#8A2BE2' : '#4169E1'; 
        createCylinder(0.2, 0.2, h, 6, col, rx, h/2, rz, g);
    }
    for(let i=0; i<10; i++) {
        const sx = (Math.random() - 0.5) * 40;
        const sz = (Math.random() - 0.5) * 40;
        if (Math.abs(sx) < 12 && Math.abs(sz) < 22) continue;
        createBox(1.5, 1.5, 1.5, '#FFD700', sx, 0.75, sz, g);
    }
    parent.add(g);
};

const createPacificScienceCenter = (x, z, parent) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Scaling down: The previous one was 90x160.
    // New scale: Pool ~60x60.
    const poolSize = 60;
    const poolHalf = poolSize / 2;

    // 1. Water
    const waterGeo = new THREE.BoxGeometry(poolSize, 0.4, poolSize);
    const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x00AADD, roughness: 0.1, metalness: 0.1,
        transmission: 0.8, opacity: 0.8, transparent: true
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.2;
    group.add(water);

    // 2. Pool Border/Floor
    createBox(poolSize + 2, 0.2, poolSize + 2, '#FFFFFF', 0, 0, 0, group);
    // Concrete Walls for pool
    createBox(poolSize + 4, 1.5, 1, '#EEEEEE', 0, 0.75, poolHalf + 0.5, group); // Front
    createBox(poolSize + 4, 1.5, 1, '#EEEEEE', 0, 0.75, -poolHalf - 0.5, group); // Back
    createBox(1, 1.5, poolSize + 2, '#EEEEEE', poolHalf + 0.5, 0.75, 0, group); // Right
    createBox(1, 1.5, poolSize + 2, '#EEEEEE', -poolHalf - 0.5, 0.75, 0, group); // Left

    // 3. The Arches (Towers)
    // We will generate voxels for ONE tower and instance it 5 times.
    const towerVoxels = [];
    const H = 32; // Height
    const R_BASE = 3.5; // Base radius

    // Vertical resolution
    const vRes = 0.5;
    for (let y = 0; y <= H; y += vRes) {
        const t = y / H;

        // Curve profile: Straight base, then Gothic curve
        let r = R_BASE;
        const curveStart = 0.3; // Stays straight for bottom 30%
        if (t > curveStart) {
            // Normalized t for curve part
            const tc = (t - curveStart) / (1 - curveStart);
            // Cosine curve to 0
            r = R_BASE * Math.cos(tc * Math.PI / 2);
        }
        
        // Ensure strictly non-negative
        if (r < 0.1) r = 0.1;

        // Generate the 4 ribs (Corners of the square cross-section)
        const offsets = [
            {x: r, z: r}, {x: -r, z: r}, {x: r, z: -r}, {x: -r, z: -r}
        ];

        offsets.forEach(off => {
            towerVoxels.push({x: off.x, y: y, z: off.z});
        });

        // Horizontal Lattice Rings
        // Add a ring every 3 units
        if (y % 3.0 < vRes) {
            // Fill perimeter square
            const step = 0.4;
            for (let dx = -r; dx <= r; dx += step) {
                towerVoxels.push({x: dx, y: y, z: r});
                towerVoxels.push({x: dx, y: y, z: -r});
            }
            for (let dz = -r; dz <= r; dz += step) {
                towerVoxels.push({x: r, y: y, z: dz});
                towerVoxels.push({x: -r, y: y, z: dz});
            }
        }
        
        // Add a central spire tip at the very top
        if (y > H - 1) {
            towerVoxels.push({x: 0, y: y, z: 0});
        }
    }

    // Create Instance Mesh for Towers
    const boxGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    const boxMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.2 });
    const towerMesh = new THREE.InstancedMesh(boxGeo, boxMat, towerVoxels.length * 5);
    
    // Tower Locations in the pool
    // 5 Towers: Center, and 4 corners
    const spacing = 14;
    const locations = [
        {x: 0, z: 0},
        {x: spacing, z: spacing},
        {x: -spacing, z: spacing},
        {x: spacing, z: -spacing},
        {x: -spacing, z: -spacing}
    ];

    let idx = 0;
    const dummy = new THREE.Object3D();
    
    locations.forEach(loc => {
        towerVoxels.forEach(v => {
            dummy.position.set(v.x + loc.x, v.y + 0.2, v.z + loc.z);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            towerMesh.setMatrixAt(idx++, dummy.matrix);
        });
    });
    
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    group.add(towerMesh);

    // 4. Floating Fountains (Simple white blocks near bases)
    const fGroup = new THREE.Group();
    locations.forEach(loc => {
        createBox(2, 0.5, 2, '#FFFFFF', loc.x, 0.5, loc.z, fGroup);
    });
    group.add(fGroup);

    if (parent) parent.add(group);
};

// --- MOPOP HELPERS ---
function createSteppedLobe(scene, center, dimensions, colorHex, matParams, shapeFn, parent, exclusionFn) {
    const { w, h, d } = dimensions;
    const voxelSize = 1.25; 
    const voxels = [];
    const grid = new Map();

    for(let y = 0; y < h; y += voxelSize) {
        for(let x = -w; x <= w; x += voxelSize) {
            for(let z = -d; z <= d; z += voxelSize) {
                let nx = x / w;
                let ny = (y - h/2) / (h/2);
                let nz = z / d;
                
                if (shapeFn(nx, ny, nz)) {
                    const vx = center.x + x;
                    const vy = center.y + y;
                    const vz = center.z + z;
                    if (exclusionFn && exclusionFn(vx, vy, vz)) {
                        continue;
                    }

                    const ix = Math.round(x / voxelSize);
                    const iy = Math.round(y / voxelSize);
                    const iz = Math.round(z / voxelSize);
                    const key = `${ix},${iy},${iz}`;
                    
                    grid.set(key, { 
                        x: vx, 
                        y: vy, 
                        z: vz 
                    });
                }
            }
        }
    }

    grid.forEach((val, key) => {
        const [ix, iy, iz] = key.split(',').map(Number);
        const neighbors = [
            `${ix+1},${iy},${iz}`, `${ix-1},${iy},${iz}`, `${ix},${iy+1},${iz}`,
            `${ix},${iy-1},${iz}`, `${ix},${iy},${iz+1}`, `${ix},${iy},${iz-1}`
        ];
        if (neighbors.some(nKey => !grid.has(nKey))) {
            voxels.push(val);
        }
    });

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        ...matParams
    });

    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
    const dummy = new THREE.Object3D();
    
    voxels.forEach((v, i) => {
        if (v && typeof v.x === 'number') {
            dummy.position.set(v.x, v.y, v.z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
    });
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
}

// --- SPACE NEEDLE ---
const NEEDLE_PALETTE = {
  LEG_WHITE: '#FFFFFF',        
  CORE_CONCRETE: '#DDDDDD',    
  GLASS_BLUE: '#AACCFF',       
  GALAXY_GOLD: '#FF9900', 
  WARNING_RED: '#FF3333',      
  DARK_STEEL: '#444444',       
  ELEVATOR_RED: '#D03030',
  ELEVATOR_YELLOW: '#F0C000',
  ELEVATOR_BLUE: '#3060D0',
  INTERIOR_FLOOR: '#222222', 
  INTERIOR_WALL: '#EEEEEE',  
  FURNITURE_WOOD: '#8B5A2B', 
  KIOSK_SCREEN: '#00AAFF',   
  GLASS_FLOOR: '#99CCFF',
  GLASS_BARRIER: '#E0F5FF',
  BENCH_GLASS: '#DDEEFF'
};

const rotatePoint = (x, z, angleDeg) => {
  const rad = angleDeg * (Math.PI / 180);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - z * s, z: x * s + z * c };
};

const generateNeedleVoxels = () => {
  const solidVoxels = [];
  const glassVoxels = [];
  const rotatingVoxels = [];
  const rotatingGlassVoxels = [];

  const add = (x, y, z, color, type = 'solid') => {
    const v = { x: Math.round(x), y: Math.round(y), z: Math.round(z), color };
    if (type === 'glass') glassVoxels.push(v);
    else if (type === 'rotating') rotatingVoxels.push(v);
    else if (type === 'rotatingGlass') rotatingGlassVoxels.push(v);
    else solidVoxels.push(v);
  };
  const addTri = (x, y, z, color, type = 'solid') => {
    for (let angle of [0, 120, 240]) {
      const p = rotatePoint(x, z, angle);
      add(p.x, y, p.z, color, type);
    }
  };
  const addHex = (x, y, z, color, type = 'solid') => {
    for (let i = 0; i < 6; i++) {
      const p = rotatePoint(x, z, i * 60);
      add(p.x, y, p.z, color, type);
    }
  };

  const LEVEL_GROUND = 0;
  const LEVEL_SKYLINE = 80;
  const LEVEL_WAIST = 300;
  const LEVEL_SOFFIT_START = 400;
  const LEVEL_LOUPE_FLOOR = 415; 
  const LEVEL_OPEN_DECK_FLOOR = 428; 
  const LEVEL_ROOF_BRIM = 442;
  const LEVEL_ROOF_PEAK = 460;
  
  for (let y = -40; y <= 0; y++) {
    const t = (y + 40) / 40; 
    const r = 80 * (1 - t * 0.5); 
    for (let dx = -r; dx <= r; dx+=2) {
      for (let dz = -r; dz <= r; dz+=2) {
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < r && (dist > r - 3 || y === 0)) {
             add(dx, y, dz, NEEDLE_PALETTE.CORE_CONCRETE);
        }
      }
    }
  }

  for (let y = 0; y < 25; y++) {
      const r = 55;
      for (let d = 0; d < 360; d+=2) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.GLASS_BLUE, 'glass');
      }
      if (y===24) {
        for(let d=0; d<360; d+=1) {
            const p = rotatePoint(r, 0, d);
            add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
        }
      }
  }

  for (let y = 0; y < LEVEL_SOFFIT_START; y++) {
    const coreRad = 8;
    addHex(coreRad, y, 0, NEEDLE_PALETTE.CORE_CONCRETE);
    addHex(coreRad - 1, y, 0, NEEDLE_PALETTE.CORE_CONCRETE);
    if (y < LEVEL_SOFFIT_START - 20) {
      const trackDist = 9;
      const p = rotatePoint(trackDist, 0, 60); 
      addTri(p.x, y, p.z, NEEDLE_PALETTE.DARK_STEEL);
    }
  }
  
  const SKYLINE_HEIGHT = 12;
  const SKY_R_FLOOR = 46;
  const SKY_R_ROOF = 50;
  for (let y = LEVEL_SKYLINE; y <= LEVEL_SKYLINE + SKYLINE_HEIGHT; y++) {
      if (y === LEVEL_SKYLINE) {
          for(let r=12; r<=SKY_R_FLOOR; r++) {
             for(let d=0; d<360; d+=1) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
             }
          }
      }
      if (y === LEVEL_SKYLINE + SKYLINE_HEIGHT) {
          for(let r=12; r<=SKY_R_ROOF; r++) {
             for(let d=0; d<360; d+=1) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
             }
          }
      }
      if (y > LEVEL_SKYLINE && y < LEVEL_SKYLINE + SKYLINE_HEIGHT) {
          for (let d = 0; d < 360; d+=0.8) {
             const p = rotatePoint(SKY_R_FLOOR, 0, d);
             add(p.x, y, p.z, NEEDLE_PALETTE.GLASS_BLUE, 'glass');
          }
          if (y % 4 === 0) {
             for(let d=0; d<360; d+=30) {
                 const p = rotatePoint(SKY_R_FLOOR-2, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
             }
          }
      }
  }

  for (let y = 0; y <= LEVEL_SOFFIT_START; y++) {
    let r;
    if (y < LEVEL_WAIST) {
       const t = y / LEVEL_WAIST;
       r = 15 + 60 * Math.pow(1 - t, 2.5);
    } else {
       const t = (y - LEVEL_WAIST) / (LEVEL_SOFFIT_START - LEVEL_WAIST);
       r = 15 + 40 * Math.pow(t, 2); 
    }
    const colOffset = 6; 
    for (let dr = 0; dr < 3; dr++) {
      for (let dz = -1; dz <= 1; dz++) {
        addTri(r + dr, y, -colOffset + dz, NEEDLE_PALETTE.LEG_WHITE);
      }
    }
    for (let dr = 0; dr < 3; dr++) {
      for (let dz = -1; dz <= 1; dz++) {
        addTri(r + dr, y, colOffset + dz, NEEDLE_PALETTE.LEG_WHITE);
      }
    }
    const bracePeriod = 20;
    const localY = y % bracePeriod;
    const t = localY / bracePeriod;
    const z1 = -colOffset + (t * colOffset * 2);
    addTri(r, y, z1, NEEDLE_PALETTE.LEG_WHITE);
    addTri(r+1, y, z1, NEEDLE_PALETTE.LEG_WHITE); 
    const z2 = colOffset - (t * colOffset * 2);
    addTri(r, y, z2, NEEDLE_PALETTE.LEG_WHITE);
    addTri(r+1, y, z2, NEEDLE_PALETTE.LEG_WHITE); 
    if (localY < 2) {
       for(let z=-colOffset; z<=colOffset; z++) {
          addTri(r, y, z, NEEDLE_PALETTE.LEG_WHITE);
          addTri(r+1, y, z, NEEDLE_PALETTE.LEG_WHITE);
       }
    }
  }

  for (let d = 0; d < 360; d+=0.5) {
      const p = rotatePoint(55, 0, d);
      add(p.x, LEVEL_SOFFIT_START, p.z, NEEDLE_PALETTE.LEG_WHITE);
  }

  for (let y = LEVEL_SOFFIT_START; y < LEVEL_LOUPE_FLOOR; y++) {
    const t = (y - LEVEL_SOFFIT_START) / (LEVEL_LOUPE_FLOOR - LEVEL_SOFFIT_START); 
    const rOuter = 50 + (t * 30); 
    const rInner = 8;
    for (let i = 0; i < 48; i++) {
        const angle = i * (360/48);
        const steps = 10;
        for (let s=0; s<=steps; s++) {
            const st = s/steps;
            const rCurrent = rInner + (rOuter - rInner) * st;
            const curveHeight = Math.pow(st, 0.5);
            if (t > (1-curveHeight) * 0.2) { 
                 const p = rotatePoint(rCurrent, 0, angle);
                 add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
            }
        }
    }
  }

  for (let y = LEVEL_LOUPE_FLOOR; y < LEVEL_OPEN_DECK_FLOOR; y++) {
      const isFloor = y === LEVEL_LOUPE_FLOOR;
      const isCeiling = y === LEVEL_OPEN_DECK_FLOOR - 1;
      
      if (isFloor) {
          for (let r=10; r<60; r+=2) {
             for (let d=0; d<360; d+=2) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.INTERIOR_FLOOR);
             }
          }
          for (let r=60; r<78; r+=1) {
             for (let d=0; d<360; d+=1) {
                 const p = rotatePoint(r, 0, d);
                 const isRib = d % 15 === 0;
                 if (isRib) {
                     add(p.x, y, p.z, '#FFFFFF', 'rotating'); 
                 } else {
                     add(p.x, y, p.z, NEEDLE_PALETTE.GLASS_FLOOR, 'rotatingGlass');
                 }
             }
          }
          for (let r=78; r<80; r+=1) {
             for (let d=0; d<360; d+=2) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.DARK_STEEL);
             }
          }
      }

      if (isCeiling) {
          for (let r=10; r<80; r+=2) {
             for (let d=0; d<360; d+=2) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.INTERIOR_WALL);
             }
          }
      }

      if (y >= LEVEL_LOUPE_FLOOR + 1 && y <= LEVEL_LOUPE_FLOOR + 4) {
          const elevatorAngles = [60, 180, 300];
          for (let d=0; d<360; d+=2) {
             let isDoorway = false;
             for(let ang of elevatorAngles) {
                 let diff = Math.abs(d - ang);
                 if (diff > 180) diff = 360 - diff;
                 if (diff < 9) { 
                     isDoorway = true;
                     break;
                 }
             }

             if (!isDoorway) {
                 const p = rotatePoint(16, 0, d);
                 add(p.x, y, p.z, NEEDLE_PALETTE.INTERIOR_WALL);
             }
          }

          for (let k=0; k<6; k++) {
              const angle = k * 60 + 15;
              const rKiosk = 45;
              for (let w=-2; w<=2; w++) {
                  const p = rotatePoint(rKiosk + w, 0, angle);
                  add(p.x, y, p.z, NEEDLE_PALETTE.KIOSK_SCREEN);
              }
              if (y === LEVEL_LOUPE_FLOOR + 1) {
                   const p = rotatePoint(rKiosk, 0, angle);
                   add(p.x, y, p.z, NEEDLE_PALETTE.FURNITURE_WOOD);
              }
          }
      }

      const t = (y - LEVEL_LOUPE_FLOOR) / (LEVEL_OPEN_DECK_FLOOR - LEVEL_LOUPE_FLOOR);
      const r = 80 + t * 4; 

      for (let d=0; d<360; d+=0.6) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.GLASS_BLUE, 'glass');
      }
      
      if (y % 6 === 0) {
         for (let d=0; d<360; d+=15) {
             const p = rotatePoint(r-1, 0, d);
             add(p.x, y, p.z, NEEDLE_PALETTE.DARK_STEEL);
         }
      }
  }

  for (let y = LEVEL_OPEN_DECK_FLOOR; y < LEVEL_ROOF_BRIM; y++) {
      const isFloor = y === LEVEL_OPEN_DECK_FLOOR;

      if (isFloor) {
          for (let r=12; r<84; r+=2) {
             for (let d=0; d<360; d+=2) {
                 const p = rotatePoint(r, 0, d);
                 add(p.x, y, p.z, '#BBBBBB'); 
             }
          }
      }

      if (y >= LEVEL_OPEN_DECK_FLOOR + 1 && y <= LEVEL_OPEN_DECK_FLOOR + 2) {
          for (let b=0; b<12; b++) {
              const angle = b * 30;
              const rBench = 75;
              for(let w=-2; w<=2; w++) {
                 const p = rotatePoint(rBench, w, angle);
                 add(p.x, y, p.z, NEEDLE_PALETTE.FURNITURE_WOOD);
              }
          }
      }

      const t = (y - LEVEL_OPEN_DECK_FLOOR) / (LEVEL_ROOF_BRIM - LEVEL_OPEN_DECK_FLOOR);
      const r = 84 + t * 8;

      for (let d=0; d<360; d+=0.6) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.GLASS_BARRIER, 'glass');
      }

      if (y >= LEVEL_OPEN_DECK_FLOOR && y <= LEVEL_OPEN_DECK_FLOOR + 3) {
          const benchR = r - 1.5;
          for (let d=0; d<360; d+=1) {
              if (d % 20 < 12) {
                  const p = rotatePoint(benchR, 0, d);
                  add(p.x, y, p.z, NEEDLE_PALETTE.BENCH_GLASS, 'glass');
              }
          }
      }

      if (y === LEVEL_ROOF_BRIM - 1) {
           for (let d=0; d<360; d+=1) {
               const p = rotatePoint(r, 0, d);
               add(p.x, y, p.z, NEEDLE_PALETTE.DARK_STEEL);
           }
      }
  }

  for (let y = LEVEL_ROOF_BRIM; y < LEVEL_ROOF_BRIM + 5; y++) {
      const t = (y - LEVEL_ROOF_BRIM) / 5;
      const r = 92 * (1 - t * 0.3); 
      for (let d = 0; d < 360; d+=1) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.GALAXY_GOLD);
      }
      if (y % 2 === 0) {
          for (let i=0; i<60; i++) {
              const p = rotatePoint(r, 0, i*6);
              add(p.x, y+0.5, p.z, NEEDLE_PALETTE.LEG_WHITE);
          }
      }
  }

  const MEZZ_START = LEVEL_ROOF_BRIM + 5;
  for (let y = MEZZ_START; y < MEZZ_START + 12; y++) {
      const t = (y - MEZZ_START) / 12;
      const r = 64 * (1 - t * 0.5); 
      for (let d = 0; d < 360; d+=2) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.LEG_WHITE);
      }
      if (y % 3 === 0) {
         for (let d = 0; d < 360; d+=6) {
             const p = rotatePoint(r+1, 0, d);
             add(p.x, y, p.z, NEEDLE_PALETTE.DARK_STEEL);
         }
      }
  }

  const CAP_START = MEZZ_START + 12;
  for (let y = CAP_START; y < LEVEL_ROOF_PEAK; y++) {
      const t = (y - CAP_START) / (LEVEL_ROOF_PEAK - CAP_START);
      const r = 32 * (1 - t); 
      for (let d = 0; d < 360; d+=4) {
          const p = rotatePoint(r, 0, d);
          add(p.x, y, p.z, NEEDLE_PALETTE.GALAXY_GOLD);
      }
  }

  const SPIRE_HEIGHT = 90;
  for (let y=0; y<SPIRE_HEIGHT; y++) {
     const h = LEVEL_ROOF_PEAK + y;
     if (y < 25) {
         addHex(2, h, 0, NEEDLE_PALETTE.LEG_WHITE);
         addHex(1, h, 0, NEEDLE_PALETTE.LEG_WHITE);
         add(0, h, 0, NEEDLE_PALETTE.LEG_WHITE);
     } 
     else if (y < 80) {
         addHex(1, h, 0, NEEDLE_PALETTE.DARK_STEEL);
         add(0, h, 0, NEEDLE_PALETTE.DARK_STEEL);
     }
     else {
         add(0, h, 0, NEEDLE_PALETTE.WARNING_RED);
         addHex(1, h, 0, NEEDLE_PALETTE.WARNING_RED);
     }
     if (y === 30 || y === 60) {
        for(let d=0; d<360; d+=20) {
           const p = rotatePoint(4, 0, d);
           add(p.x, h, p.z, NEEDLE_PALETTE.DARK_STEEL);
        }
     }
  }

  return { 
      solid: solidVoxels, 
      glass: glassVoxels, 
      rotating: rotatingVoxels,
      rotatingGlass: rotatingGlassVoxels 
  };
};

class Elevator {
  constructor(angle, color, speedOffset, parent, audioGenerator) {
      this.angle = angle;
      this.speedOffset = speedOffset;
      this.state = {
          y: 10,
          targetY: 415,
          velocity: 0,
          mode: 'wait',
          waitTime: Math.random() * 5 + speedOffset
      };

      this.group = new THREE.Group();
      if (audioGenerator) {
          const sound = audioGenerator.createPositionalAudio('ELEVATOR', 20, 300, 0.5);
          if (sound) this.group.add(sound);
      }
      parent.add(this.group); 

      this.soundDummy = new THREE.Object3D();
      this.group.add(this.soundDummy);

      this.carGroup = new THREE.Group();
      this.group.add(this.carGroup);

      this.solidVoxels = [];
      this.glassVoxels = [];
      
      const cBody = new THREE.Color(color);
      const cDoor = new THREE.Color('#333333');
      const cFloor = new THREE.Color('#1a1a1a');

      for (let dy = 0; dy < 6; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const pLocal = rotatePoint(11 + dx, dz, angle);
            
            let type = 'solid';
            let vColor = cBody;

            if (dy === 0) { 
                type = 'solid'; vColor = cFloor;
            } else if (dy === 5) { 
                type = 'solid'; vColor = cBody;
            } else {
                if (dx === 1) { 
                    type = 'glass';
                } else if (dx === 0) { 
                    if (dz === 0) {
                        type = 'empty'; 
                    } else {
                        type = 'glass'; 
                    }
                } else { 
                    if (dz === 0) {
                        type = 'solid'; vColor = cDoor; 
                    } else {
                        type = 'solid'; vColor = cBody; 
                    }
                }
            }

            if (type !== 'empty') {
                const v = { x: pLocal.x, y: dy, z: pLocal.z, color: vColor };
                if (type === 'glass') this.glassVoxels.push(v);
                else this.solidVoxels.push(v);
            }
          }
        }
      }

      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.5 });
      this.mesh = new THREE.InstancedMesh(geo, mat, this.solidVoxels.length);
      
      const dummy = new THREE.Object3D();
      this.solidVoxels.forEach((v, i) => {
          if (v && typeof v.x === 'number') {
              dummy.position.set(v.x, v.y, v.z);
              dummy.updateMatrix();
              this.mesh.setMatrixAt(i, dummy.matrix);
              this.mesh.setColorAt(i, v.color);
          }
      });
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.carGroup.add(this.mesh);
      
      const glassMat = new THREE.MeshStandardMaterial({ 
          color: '#add8e6', transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.9 
      });
      this.glassMesh = new THREE.InstancedMesh(geo, glassMat, this.glassVoxels.length);
      
      this.glassVoxels.forEach((v, i) => {
          if (v && typeof v.x === 'number') {
              dummy.position.set(v.x, v.y, v.z);
              dummy.updateMatrix();
              this.glassMesh.setMatrixAt(i, dummy.matrix);
          }
      });
      this.glassMesh.instanceMatrix.needsUpdate = true;
      this.carGroup.add(this.glassMesh);
  }

  update(delta) {
      const s = this.state;
      const MAX_SPEED = 15;
      const ACCEL = 10;
      const STOP_Y_TOP = 415;
      const STOP_Y_BOT = 10;

      if (s.mode === 'wait') {
         s.waitTime -= delta;
         if (s.waitTime <= 0) {
             if (s.y < 100) { s.mode = 'up'; s.targetY = STOP_Y_TOP; }
             else { s.mode = 'down'; s.targetY = STOP_Y_BOT; }
         }
      } else {
         const dist = s.targetY - s.y;
         const dir = Math.sign(dist);
         if (Math.abs(s.velocity) < MAX_SPEED) s.velocity += dir * ACCEL * delta;
         if (Math.abs(dist) < 50) s.velocity *= 0.95;
         
         if (Math.abs(dist) < 1 || (dir > 0 && s.velocity < 0) || (dir < 0 && s.velocity > 0)) {
             s.y = s.targetY;
             s.velocity = 0;
             s.mode = 'wait';
             s.waitTime = 3 + Math.random() * 5;
         } else {
             s.y += s.velocity * delta;
         }
      }

      this.carGroup.position.y = s.y;

      const p = rotatePoint(11, 0, this.angle);
      this.soundDummy.position.set(p.x, s.y + 3, p.z);
  }

  getCameraTarget() {
      const r = 11;
      const h = this.state.y + 3; 
      const p = rotatePoint(r, 0, this.angle);
      const pos = new THREE.Vector3(p.x, h, p.z);
      const rad = this.angle * (Math.PI / 180);
      const dir = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad));
      const lookAt = pos.clone().add(dir.multiplyScalar(100));
      lookAt.y -= 20;
      return { position: pos, lookAt: lookAt };
  }
}

class SpaceNeedle {
    constructor(scene, x, y, z, audioGenerator) {
        this.group = new THREE.Group();
        this.group.position.set(x, y, z);
        this.group.scale.set(0.5, 0.5, 0.5); 
        const data = generateNeedleVoxels();
        const createIM = (voxels, matParams) => {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial(matParams);
            const mesh = new THREE.InstancedMesh(geo, mat, voxels.length);
            const dummy = new THREE.Object3D();
            const color = new THREE.Color();
            voxels.forEach((v, i) => {
                if (v && typeof v.x === 'number') {
                    dummy.position.set(v.x, v.y, v.z);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    if (v.color) {
                        color.set(v.color);
                        mesh.setColorAt(i, color);
                    }
                }
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        this.solidMesh = createIM(data.solid, { roughness: 0.8, metalness: 0.2 });
        this.group.add(this.solidMesh);

        this.glassMesh = createIM(data.glass, { 
            color: '#FFFFFF', 
            transparent: true, 
            opacity: 0.15, 
            roughness: 0.0, 
            metalness: 0.9,
            side: THREE.DoubleSide
        });
        this.group.add(this.glassMesh);

        this.rotatingGroup = new THREE.Group();
        
        this.rotatingMesh = createIM(data.rotating, { roughness: 0.8, metalness: 0.1 });
        this.rotatingGroup.add(this.rotatingMesh);
        
        this.rotatingGlassMesh = createIM(data.rotatingGlass, { 
            color: '#AACCFF', 
            transparent: true, 
            opacity: 0.25, 
            roughness: 0.1, 
            metalness: 0.5,
            side: THREE.DoubleSide
        });
        this.rotatingGroup.add(this.rotatingGlassMesh);

        this.elevators = [
            new Elevator(60, NEEDLE_PALETTE.ELEVATOR_BLUE, 0, this.group, audioGenerator),
            new Elevator(180, NEEDLE_PALETTE.ELEVATOR_YELLOW, 2, this.group, audioGenerator),
            new Elevator(300, NEEDLE_PALETTE.ELEVATOR_RED, 4, this.group, audioGenerator)
        ];

        this.blinkLight = new THREE.PointLight(0xff0000, 500, 40, 2);
        this.blinkLight.position.set(0, 545, 0);
        this.group.add(this.blinkLight);
        this.time = 0;

        if (scene.add) scene.add(this.group);
        else scene.add(this.group);
    }

    update(delta) {
        this.time += delta;
        this.rotatingGroup.rotation.y += delta * 0.05; 
        
        this.elevators.forEach(e => e.update(delta));
        const intensity = Math.sin(this.time * 5) > 0 ? 500 : 0;
        this.blinkLight.intensity = intensity;
    }

    getPOV() {
        const elevator = this.elevators[0];
        const local = elevator.getCameraTarget();
        this.group.updateMatrixWorld();
        const worldPos = local.position.clone().applyMatrix4(this.group.matrixWorld);
        const worldLook = local.lookAt.clone().applyMatrix4(this.group.matrixWorld);
        return { position: worldPos, lookAt: worldLook };
    }
}

const createTunnelPortal = (z, isNorth, scene, length=8) => {
    const group = new THREE.Group();
    // Center X roughly at 10 (Road is -2 to 22)
    group.position.set(10, 0, z); 
    if (isNorth) group.rotation.y = Math.PI;

    // Face starts at -4 (relative to group origin), extend backwards (towards +Z in local coords)
    // Box Center Z: (-4 + (-4 + length)) / 2 = -4 + length/2
    const boxCenterZ = -4 + length/2;

    // 1. Cap Deck (Width 40 to match sidewalks)
    createBox(40, 2, length, COLORS.CONCRETE, 0, 0, boxCenterZ, group);
    
    // 2. Landscaping on top
    createBox(38, 0.5, length-2, '#3d2817', 0, 1.25, boxCenterZ, group);
    createBox(38, 0.2, length-2, '#448844', 0, 1.6, boxCenterZ, group);
    
    const bushCount = Math.floor(length * 1.5);
    for(let i=0; i<bushCount; i++) {
        const bx = (Math.random() - 0.5) * 36;
        const bz = boxCenterZ + (Math.random() - 0.5) * (length - 3);
        createBox(0.8, 0.8, 0.8, '#228822', bx, 2.0, bz, group);
    }

    // 3. Face Details (Keep at fixed z = -4.0)
    const faceZ = -4.0;
    
    // Main Beam
    createBox(36, 0.8, 0.6, COLORS.STEEL, 0, -0.5, faceZ, group);
    
    // Lights
    [-12, 0, 12].forEach(x => {
        createBox(0.4, 4, 0.4, COLORS.STEEL, x, 2, faceZ, group);
        createBox(0.3, 0.3, 2, COLORS.STEEL, x, 3.8, faceZ + 1, group);
        // Lamp
        const hood = createBox(0.8, 0.3, 0.8, COLORS.STEEL, x, 3.6, faceZ + 2, group);
        const bulb = createBox(0.6, 0.1, 0.6, '#FFFFDD', x, 3.5, faceZ + 2, group);
        bulb.material.emissive = new THREE.Color(0xFFFFEE);
        bulb.material.emissiveIntensity = 2.0;
        
        const pl = new THREE.PointLight(0xFFFFEE, 40, 25);
        pl.position.set(x, 3.0, faceZ + 2);
        group.add(pl);
    });

    // 4. Signs
    [-8, 8].forEach((x, i) => {
        const signW = 2.5;
        const color = i === 0 ? '#FF0000' : '#00FF00';
        createBox(signW, signW, 0.2, '#111', x, 1.5, faceZ - 0.2, group);
        const sym = createBox(1.5, 1.5, 0.22, color, x, 1.5, faceZ - 0.2, group);
        sym.material.emissive = new THREE.Color(color);
        sym.material.emissiveIntensity = 2;
    });
    
    // Speed Limit
    const pX = -21;
    createBox(0.3, 5, 0.3, COLORS.STEEL, pX, 2.5, 0, group);
    const board = createBox(2.5, 3, 0.1, '#EEE', pX, 4, 0.2, group);
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.2, 32),
        new THREE.MeshBasicMaterial({ color: '#CC0000', side: THREE.DoubleSide })
    );
    ring.position.set(pX, 4, 0.26);
    group.add(ring);
    
    createBox(1.0, 0.2, 0.05, '#111', pX, 4.4, 0.26, group); 
    createBox(1.0, 0.2, 0.05, '#111', pX, 4.0, 0.26, group);
    createBox(1.0, 0.2, 0.05, '#111', pX, 3.6, 0.26, group); 
    createBox(0.2, 1.0, 0.05, '#111', pX - 0.4, 4.0, 0.26, group); 
    createBox(0.2, 1.0, 0.05, '#111', pX + 0.4, 4.0, 0.26, group); 
    
    // 5. Retaining Walls merging to ground
    createBox(2, 10, length + 4, COLORS.CONCRETE, -21, -4, boxCenterZ, group);
    createBox(2, 10, length + 4, COLORS.CONCRETE, 21, -4, boxCenterZ, group);

    scene.add(group);
}

// --- WESTLAKE MALL (Detailed Voxel Art) ---
class WestlakeMall {
    constructor(parent, x, z, audioGenerator) {
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);
        parent.add(this.group);
        
        this.gears = [];
        
        // Configuration
        const LEVEL_3_Y = 20; // Atrium floor (Above monorail Y=12)
        const LEVEL_4_Y = 32; // Mezzanine floor
        const WIDTH = 46;
        const DEPTH = 50;
        
        this.buildStructure(WIDTH, DEPTH, LEVEL_3_Y, LEVEL_4_Y);
        this.buildEscalators(LEVEL_3_Y, LEVEL_4_Y);
        this.buildShops(LEVEL_4_Y);
        this.buildVegetation(LEVEL_3_Y);
        
        // Ambient Mall Audio
        if (audioGenerator) {
             const sound = audioGenerator.createPositionalAudio('MOPOP', 60, 400, 0.4); 
             if (sound) this.group.add(sound);
        }
    }

    update(delta) {
        // Animate Gears
        this.gears.forEach((gear, i) => {
            // Alternate rotation direction
            const dir = i % 2 === 0 ? 1 : -1;
            gear.rotation.y += delta * 1.5 * dir;
        });
    }
    
    buildStructure(w, d, y3, y4) {
        const pillarColor = '#9999AA'; // Concrete
        const pillarW = 2.5;
        const roofY = y4 + 16; 

        // 1. Columns (Extended to Ground)
        const colsX = [ -19, -10, 10, 19 ];
        const colsZ = [ -22, 0, 22 ];
        
        colsX.forEach(cx => {
            colsZ.forEach(cz => {
                if (Math.abs(cx) < 8) return; 
                // Pillar from ground (0) to roof
                createBox(pillarW, roofY, pillarW, pillarColor, cx, roofY / 2, cz, this.group);
            });
        });
        
        // 2. Level 3 Floor (Atrium)
        const floorGroup = new THREE.Group();
        floorGroup.position.y = y3;
        this.group.add(floorGroup);
        
        createBox(w, 1, d, '#DDDDDD', 0, -0.5, 0, floorGroup);
        
        const tSize = 0.5;
        const tVoxels = [];
        const colors = ['#FFFFFF', '#EEDDCC', '#CCEEFF']; 
        
        for(let x=-w/2; x<w/2; x+=tSize) {
            for(let z=-d/2; z<d/2; z+=tSize) {
                if (Math.abs(x) < 5 && Math.abs(z) < 12) continue; // Escalator Pit
                if (Math.random() > 0.85) {
                    const col = colors[Math.floor(Math.random() * colors.length)];
                    tVoxels.push({x: x + tSize/2, y: 0.05, z: z + tSize/2, color: col});
                }
            }
        }
        
        if (tVoxels.length > 0) {
            const geo = new THREE.BoxGeometry(tSize, 0.1, tSize);
            const mat = new THREE.MeshStandardMaterial({ roughness: 0.2 });
            const mesh = new THREE.InstancedMesh(geo, mat, tVoxels.length);
            const dummy = new THREE.Object3D();
            const c = new THREE.Color();
            tVoxels.forEach((v, i) => {
                dummy.position.set(v.x, v.y, v.z);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                c.set(v.color);
                mesh.setColorAt(i, c);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            floorGroup.add(mesh);
        }
        
        // 3. Level 4 (Full Upper Floor with Atrium Void)
        const f4 = new THREE.Group();
        f4.position.y = y4;
        this.group.add(f4);
        
        const f4Thick = 1;
        const f4Color = '#EEEEEE';
        
        // West Slab 
        createBox(16, f4Thick, d, f4Color, -15, -f4Thick/2, 0, f4);

        // East Slab 
        createBox(16, f4Thick, d, f4Color, 15, -f4Thick/2, 0, f4);
        
        // North Slab (Landing)
        createBox(14, f4Thick, 16, f4Color, 0, -f4Thick/2, -17, f4);
        
        // South Slab (Balcony)
        createBox(14, f4Thick, 14, f4Color, 0, -f4Thick/2, 18, f4);

        // Railing
        const railH = 1.1;
        const railMat = new THREE.MeshStandardMaterial({
            color: '#AACCFF', transparent: true, opacity: 0.4
        });
        const addRail = (rw, rd, rx, rz) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(rw, railH, rd), railMat);
            m.position.set(rx, railH/2, rz);
            f4.add(m);
        };
        addRail(0.2, 20, -7.1, 1);
        addRail(0.2, 20, 7.1, 1);
        addRail(14.2, 0.2, 0, -9.1);
        addRail(14.2, 0.2, 0, 11.1);
        
        // 4. Glass Enclosure
        const glassH = roofY - y3;
        const gGroup = new THREE.Group();
        gGroup.position.y = y3 + glassH/2;
        this.group.add(gGroup);
        
        const wallMat = new THREE.MeshStandardMaterial({
            color: '#DDEEFF', transparent: true, opacity: 0.15, 
            roughness: 0.0, metalness: 0.8, side: THREE.DoubleSide
        });
        
        const wWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, glassH, d), wallMat);
        wWall.position.x = -w/2;
        gGroup.add(wWall);
        
        const eWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, glassH, d), wallMat);
        eWall.position.x = w/2;
        gGroup.add(eWall);
        
        const nWall = new THREE.Mesh(new THREE.BoxGeometry(w, glassH, 0.5), wallMat);
        nWall.position.z = -d/2;
        gGroup.add(nWall);
        
        const sWall = new THREE.Mesh(new THREE.BoxGeometry(w, glassH, 0.5), wallMat);
        sWall.position.z = d/2;
        gGroup.add(sWall);
        
        // 5. Roof
        const roofGroup = new THREE.Group();
        roofGroup.position.y = roofY;
        this.group.add(roofGroup);
        
        createBox(w + 2, 2, d + 2, '#EEEEEE', 0, 1, 0, roofGroup);
        const skylight = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 30), wallMat);
        skylight.position.y = 1;
        roofGroup.add(skylight);
    }

    buildEscalators(yBot, yTop) {
        const xOffset = 2.5; // Two escalators side by side
        const zStart = 10;
        const zEnd = -8;
        
        // 1. Gear Chambers (Under Glass) at Bottom
        this.createGearChamber(0, yBot - 1.5, zStart + 2);
        // And Top
        this.createGearChamber(0, yTop - 1.5, zEnd - 2);

        // 2. Escalator Ramps
        // Left (Up)
        this.createEscalatorUnit(-xOffset, yBot, zStart, yTop, zEnd);
        // Right (Down)
        this.createEscalatorUnit(xOffset, yBot, zStart, yTop, zEnd);
    }

    createGearChamber(x, y, z) {
        // Glass Cover
        const glass = createBox(8, 0.2, 6, '#88CCFF', x, y + 1.5, z, this.group);
        glass.material.transparent = true;
        glass.material.opacity = 0.3;
        
        // Gears
        const redStone = '#CC2222';
        const gold = '#FFAA00';
        
        this.createGear(x - 2, y, z - 1, 1.2, redStone);
        this.createGear(x + 2, y, z + 1, 1.2, redStone);
        this.createGear(x, y, z, 0.8, gold);
        
        // Shafts
        createCylinder(0.2, 0.2, 4, 8, '#555', x - 2, y-2, z - 1, this.group);
        createCylinder(0.2, 0.2, 4, 8, '#555', x + 2, y-2, z + 1, this.group);
    }

    createGear(x, y, z, radius, color) {
       const g = new THREE.Group();
       g.position.set(x, y, z);
       this.group.add(g);
       
       createCylinder(radius, radius, 0.5, 16, color, 0, 0, 0, g);
       // Teeth
       for(let i=0; i<8; i++) {
           const ang = (i/8)*Math.PI*2;
           const tx = Math.cos(ang) * (radius + 0.2);
           const tz = Math.sin(ang) * (radius + 0.2);
           createBox(0.4, 0.5, 0.4, color, tx, 0, tz, g).rotation.y = -ang;
       }
       this.gears.push(g);
       return g;
    }

    createEscalatorUnit(x, yBot, zStart, yTop, zEnd) {
        const slopeGroup = new THREE.Group();
        slopeGroup.position.set(x, 0, 0);
        this.group.add(slopeGroup);
        
        const length = zStart - zEnd;
        const height = yTop - yBot;
        const angle = Math.atan2(height, length);
        const dist = Math.sqrt(length*length + height*height);
        
        // Balustrades (Glass + Silver)
        const midY = (yTop + yBot) / 2;
        const midZ = (zStart + zEnd) / 2;
        
        const balustrade = new THREE.Group();
        balustrade.position.set(0, midY, midZ);
        balustrade.rotation.x = angle; // Slope up towards negative Z (visual)
        slopeGroup.add(balustrade);
        
        // Glass Sides
        const glassMat = new THREE.MeshStandardMaterial({
            color: '#AACCFF', transparent: true, opacity: 0.3
        });
        const gL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, dist), glassMat);
        gL.position.x = -1;
        balustrade.add(gL);
        const gR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, dist), glassMat);
        gR.position.x = 1;
        balustrade.add(gR);
        
        // Handrails (Black)
        createBox(0.3, 0.2, dist, '#111', -1, 0.85, 0, balustrade);
        createBox(0.3, 0.2, dist, '#111', 1, 0.85, 0, balustrade);
        
        // Steps (Voxelated Grooves)
        const numSteps = 30;
        const stepDist = dist / numSteps;
        
        for(let i=0; i<numSteps; i++) {
            const z = (i - numSteps/2) * stepDist;
            const step = new THREE.Group();
            step.position.set(0, -0.5, z);
            balustrade.add(step);
            
            // Step Body (Silver)
            createBox(1.8, 0.1, stepDist*1.1, '#AAAAAA', 0, 0, 0, step);
            createBox(1.8, 0.2, 0.1, '#888888', 0, 0.1, stepDist/2, step); // Riser
            
            // Yellow Safety Lines
            createBox(0.1, 0.11, stepDist, '#FFFF00', -0.85, 0, 0, step);
            createBox(0.1, 0.11, stepDist, '#FFFF00', 0.85, 0, 0, step);
        }
    }

    buildShops(y) {
        const shopGroup = new THREE.Group();
        shopGroup.position.set(0, y, 22); // Back Wall of Mezzanine
        this.group.add(shopGroup);
        
        // Shop 1: Clothing
        this.createStorefront(-10, 0, '#FFCCCC', 'CLOTHING', shopGroup);
        
        // Shop 2: Coffee
        this.createStorefront(10, 0, '#6F4E37', 'COFFEE', shopGroup);
    }
    
    createStorefront(x, y, color, type, parent) {
        const g = new THREE.Group();
        g.position.set(x, y, 0);
        parent.add(g);
        
        // Facade
        createBox(18, 6, 1, '#EEEEEE', 0, 3, 0, g);
        createBox(16, 5, 0.5, '#222', 0, 2.5, 0.5, g); // Interior void
        
        // Sign
        createBox(10, 1, 0.2, color, 0, 5, 0.8, g);
        
        if (type === 'CLOTHING') {
            // Mannequins (Pixel Art Style)
            for(let i=-1; i<=1; i+=2) {
                const m = new THREE.Group();
                m.position.set(i*3, 0, 1.5);
                createBox(0.4, 1.5, 0.4, '#FFDDBB', 0, 0.75, 0, m); // Legs
                createBox(0.6, 1.2, 0.4, '#FF5555', 0, 2.0, 0, m); // Torso
                createBox(0.4, 0.4, 0.4, '#FFDDBB', 0, 2.8, 0, m); // Head
                g.add(m);
            }
        } else if (type === 'COFFEE') {
            // Counter
            createBox(12, 1.2, 1, '#8B4513', 0, 0.6, 2, g);
            // Espresso Machine
            createBox(2, 1.5, 1, '#C0C0C0', -2, 1.8, 2, g);
            // Cups
            createBox(0.3, 0.4, 0.3, '#FFF', 0, 1.4, 2, g);
            createBox(0.3, 0.4, 0.3, '#FFF', 1, 1.4, 2, g);
        }
    }
    
    buildVegetation(y) {
        // Voxel Planter
        const pGroup = new THREE.Group();
        pGroup.position.set(-12, y, -10);
        this.group.add(pGroup);
        
        createBox(6, 1, 6, '#8B4513', 0, 0.5, 0, pGroup); // Soil Box
        createBox(5, 0.5, 5, '#228822', 0, 1.0, 0, pGroup); // Grass
        
        // Palm Tree
        const trunkColor = '#5C4033';
        const leafColor = '#32CD32';
        createBox(0.6, 5, 0.6, trunkColor, 0, 3, 0, pGroup);
        
        // Leaves
        const lY = 5.5;
        createBox(4, 0.2, 0.6, leafColor, 0, lY, 0, pGroup);
        createBox(0.6, 0.2, 4, leafColor, 0, lY, 0, pGroup);
        createBox(3, 0.2, 0.6, leafColor, 0, lY+0.2, 0, pGroup).rotation.y = Math.PI/4;
        createBox(0.6, 0.2, 3, leafColor, 0, lY+0.2, 0, pGroup).rotation.y = Math.PI/4;
        
        // Second Planter
        const p2 = pGroup.clone();
        p2.position.set(12, y, -10);
        this.group.add(p2);
    }
}

// --- MAIN ENVIRONMENT ---
export function createEnvironment(scene, audioGenerator) {
  const env = new THREE.Group();
  
  createPlane(2000, 2000, '#556655', 0, -20, 0, -Math.PI/2, env);

  createPlane(1000, 2000, '#556655', -510, -0.1, 0, -Math.PI/2, env); 
  createPlane(1000, 2000, '#556655', 530, -0.1, 0, -Math.PI/2, env);
  createPlane(40, 1000, '#556655', 10, -0.1, 580, -Math.PI/2, env);
  createPlane(40, 1000, '#556655', 10, -0.1, -730, -Math.PI/2, env);

  createFifthAvePavement(env);

  createTunnelGeometry(env);
  createTunnelSignage(env); 
  createTunnelPortal(95, false, env, 60);
  createTunnelPortal(-215, true, env, 60);

  // --- WESTLAKE MALL ---
  const westlake = new WestlakeMall(env, 10, 50, audioGenerator);
  animatedObjects.push(westlake);

  // --- SEATTLE CENTER ---
  const seattleCenter = new THREE.Group();
  seattleCenter.position.set(-155, 0, -280);
  createBox(50, 2, 16, '#EEEEEE', 0, TRACK_HEIGHT - 1, 0, seattleCenter); 
  createBox(50, 1.2, 0.2, COLORS.STEEL, 0, TRACK_HEIGHT + 1, 7.8, seattleCenter).material.opacity = 0.5;
  createBox(50, 0.2, 0.4, '#C0C0C0', 0, TRACK_HEIGHT + 1.6, 7.8, seattleCenter);
  createBox(50, 1.2, 0.2, COLORS.STEEL, 0, TRACK_HEIGHT + 1, -7.8, seattleCenter).material.opacity = 0.5;
  createBox(50, 0.2, 0.4, '#C0C0C0', 0, TRACK_HEIGHT + 1.6, -7.8, seattleCenter);
  [-15, 0, 15].forEach(x => {
      createBox(1.5, 6, 1.5, COLORS.CONCRETE_DARK, x, TRACK_HEIGHT + 3, 0, seattleCenter);
      const w1 = createBox(1.4, 1, 8, COLORS.CONCRETE, x, TRACK_HEIGHT + 6, 3, seattleCenter); w1.rotation.x = 0.4;
      const w2 = createBox(1.4, 1, 8, COLORS.CONCRETE, x, TRACK_HEIGHT + 6, -3, seattleCenter); w2.rotation.x = -0.4;
  });
  createBox(60, 0.5, 18, '#FFFFFF', 0, TRACK_HEIGHT + 7.5, 0, seattleCenter); 
  createBench(-10, TRACK_HEIGHT - 0.5, 4, 0, seattleCenter);
  createBench(10, TRACK_HEIGHT - 0.5, 4, 0, seattleCenter);
  createBench(-10, TRACK_HEIGHT - 0.5, -4, 0, seattleCenter);
  createBench(10, TRACK_HEIGHT - 0.5, -4, 0, seattleCenter);
  createTicketMachine(20, TRACK_HEIGHT - 0.5, 0, 0, seattleCenter);
  createTurnstile(22, TRACK_HEIGHT - 0.5, 2, seattleCenter);
  createTurnstile(22, TRACK_HEIGHT - 0.5, -2, seattleCenter);

  createBox(2, 2, 2, '#333', 4, TRACK_HEIGHT+1, 2.5, seattleCenter);
  createBox(0.2, 1, 1.5, '#FF0000', 5.1, TRACK_HEIGHT+1, 2.5, seattleCenter).material.emissive = new THREE.Color('#550000');
  createBox(2, 2, 2, '#333', 4, TRACK_HEIGHT+1, -2.5, seattleCenter);
  createBox(0.2, 1, 1.5, '#FF0000', 5.1, TRACK_HEIGHT+1, -2.5, seattleCenter).material.emissive = new THREE.Color('#550000');

  const spiral = new THREE.Group();
  spiral.position.set(28, 0, 8);
  createCylinder(1.5, 1.5, 14, 16, COLORS.CONCRETE, 0, 6, 0, spiral);
  const booth = new THREE.Group(); booth.position.set(4, 0, 4);
  createCylinder(2.5, 2.5, 3, 6, '#334455', 0, 1.5, 0, booth);
  createCylinder(2.6, 2.6, 1, 6, '#222', 0, 1.5, 0, booth);
  createCylinder(0, 3, 1.5, 6, '#222', 0, 3.5, 0, booth);
  spiral.add(booth);
  for(let i=0; i<24; i++) {
      const s = new THREE.Group();
      s.position.y = i*0.5 + 0.5; s.rotation.y = i*0.3;
      createBox(3, 0.2, 1.2, '#DDD', 3, 0, 0, s).rotation.z = 0.1;
      createBox(0.1, 1.2, 0.1, '#333', 4.4, 0.6, 0, s);
      createBox(0.1, 0.1, 1.5, 'red', 4.4, 1.2, 0.5, s).rotation.x = 0.1;
      spiral.add(s);
  }
  seattleCenter.add(spiral);
  
  createArmory(15, 0, -30, seattleCenter); 
  createMuralAmphitheater(-70, 0, -35, seattleCenter);
  createChihulyGarden(-40, 0, 25, seattleCenter);
  createPacificScienceCenter(-60, 260, seattleCenter);

  env.add(seattleCenter);

  const needle = new SpaceNeedle(seattleCenter, -40, 0, 85, audioGenerator);
  animatedObjects.push(needle);

  const mopop = new THREE.Group();
  mopop.position.set(-70, 0, -280);
  mopop.rotation.y = Math.PI / 4;
  mopop.updateMatrix(); 

  const spotCount = 4;
  const spotRadius = 50; 
  for (let i = 0; i < spotCount; i++) {
      const angle = (i / spotCount) * Math.PI * 2;
      const x = Math.sin(angle) * spotRadius;
      const z = Math.cos(angle) * spotRadius;
      
      const spotLight = new THREE.SpotLight(0xFFFFFF, 2000);
      spotLight.position.set(x, 0.5, z);
      spotLight.angle = Math.PI / 6;
      spotLight.penumbra = 0.5;
      spotLight.decay = 1.5;
      spotLight.distance = 200;
      spotLight.target.position.set(0, 20, 0); 
      mopop.add(spotLight);
      mopop.add(spotLight.target);

      createCylinder(0.5, 0.6, 0.5, 8, '#222', x, 0.25, z, mopop);
      createPlane(0.4, 0.4, '#FFFFE0', x, 0.51, z, -Math.PI/2, mopop).material.emissive = new THREE.Color(0xFFFFFF);
  }

  const relevantTrackPoints = [];
  const mopopWorldPos = new THREE.Vector3(-70, 0, -280);
  [TRACK_LEFT, TRACK_RIGHT].forEach(track => {
     if (!track) return;
     const pts = track.getSpacedPoints(400); 
     if (pts) {
         pts.forEach(p => {
             if (p && Math.abs(p.z - mopopWorldPos.z) < 60 && Math.abs(p.x - mopopWorldPos.x) < 60) {
                 relevantTrackPoints.push(p);
             }
         });
     }
  });

  const checkExclusion = (localX, localY, localZ) => {
      if (typeof localY !== 'number') return false; 
      if (localY < TRACK_HEIGHT - 2 || localY > TRACK_HEIGHT + 6) return false;
      const v = new THREE.Vector3(localX, localY, localZ);
      if (mopop && mopop.matrix) {
          v.applyMatrix4(mopop.matrix);
      }
      if (!relevantTrackPoints || !Array.isArray(relevantTrackPoints) || relevantTrackPoints.length === 0) return false;
      for(let i=0; i<relevantTrackPoints.length; i++) {
          const p = relevantTrackPoints[i];
          if (!p) continue;
          if (typeof p.x === 'undefined' || typeof p.z === 'undefined') continue;
          if (typeof v.x === 'undefined' || typeof v.z === 'undefined') continue;
          const dx = p.x - v.x;
          const dz = p.z - v.z;
          if (dx*dx + dz*dz < 16) { 
              return true;
          }
      }
      return false;
  };

  if (audioGenerator) {
      const sound = audioGenerator.createPositionalAudio('MOPOP', 80, 800, 0.6);
      if (sound) mopop.add(sound);
  }

  createSteppedLobe(
    scene,
    new THREE.Vector3(-25, 0, 0),
    { w: 18, h: 22, d: 15 }, 
    '#C5A059', 
    { metalness: 1.0, roughness: 0.15 }, 
    (nx, ny, nz) => {
        const angle = Math.atan2(nz, nx);
        const radius = Math.sqrt(nx*nx + nz*nz);
        const wave = 0.8 + Math.sin(ny * 5 + angle * 2) * 0.15;
        return radius < wave;
    },
    mopop,
    checkExclusion
  );

  createSteppedLobe(
    scene,
    new THREE.Vector3(-5, 0, 25),
    { w: 12, h: 18, d: 12 },
    '#D91E36', 
    { metalness: 0.9, roughness: 0.1 }, 
    (nx, ny, nz) => {
         const dist = nx*nx + ny*ny + nz*nz;
         const bulge = (ny < 0) ? 1.0 + Math.abs(ny)*0.2 : 1.0; 
         return dist < (0.8 * bulge);
    },
    mopop,
    checkExclusion
  );

  createSteppedLobe(
    scene,
    new THREE.Vector3(16, 0, 6),
    { w: 15, h: 28, d: 15 },
    '#7A8999', 
    { metalness: 1.0, roughness: 0.1 }, 
    (nx, ny, nz) => {
        const shiftX = ny * 0.5;
        const widthAtY = 1.0 - (ny + 1) * 0.2; 
        const effectiveX = nx - shiftX;
        return (effectiveX*effectiveX + nz*nz) < (widthAtY * widthAtY);
    },
    mopop,
    checkExclusion
  );
  
  createSteppedLobe(
    scene,
    new THREE.Vector3(2, 0, -4),
    { w: 8, h: 32, d: 8 },
    '#111111', 
    { metalness: 1.0, roughness: 0.05, envMapIntensity: 2.5 }, 
    (nx, ny, nz) => {
         return Math.abs(nx) < 0.6 && Math.abs(nz) < 0.6;
    },
    mopop,
    checkExclusion
  );

  env.add(mopop);

  const city = new THREE.Group();

  const createVoxelTree = (x, z, p) => {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      createBox(0.6, 4, 0.6, '#5C4033', 0, 2, 0, g);
      const leavesColor = '#32CD32'; 
      createBox(2.4, 1.2, 2.4, leavesColor, 0, 4, 0, g);
      createBox(1.8, 1.2, 1.8, leavesColor, 0, 5, 0, g);
      createBox(1.2, 0.8, 1.2, leavesColor, 0, 6, 0, g);
      if(p) p.add(g);
  };
  
  const createLamp = (x, z, r, p, yBase = 0) => {
      const g = new THREE.Group(); g.position.set(x, yBase, z); g.rotation.y = r;
      createBox(0.8, 1, 0.8, '#444', 0, 0.5, 0, g);
      createBox(0.3, 8, 0.3, '#444', 0, 4, 0, g);
      createBox(2.5, 0.2, 0.3, '#444', 1, 7.5, 0, g);
      const glass = createBox(0.9, 0.5, 0.9, '#FFFFE0', 2, 7.2, 0, g);
      glass.material.transparent = true;
      glass.material.opacity = 0.8;
      glass.material.emissive = new THREE.Color('#FFFFE0');
      glass.material.emissiveIntensity = 0.8;
      const bulb = new THREE.PointLight(0xFFAA00, 10, 30); 
      bulb.position.set(2, 6.5, 0); 
      bulb.userData = { nightLight: true }; 
      g.add(bulb);
      if(p) p.add(g);
  };

  const exclusionZonesLeft = [
      [17.5, 42.5],   
      [-20, 0],       
      [-101, -79],    
      [-160, -120],   
      [-240, -210]    
  ];
  const exclusionZonesRight = [
      [-12.5, 12.5],  
      [30, 50],       
      [-55, -25],     
      [-92.5, -67.5], 
      [-135, -105],   
      [-172.5, -147.5], 
      [-240, -210]    
  ];

  const isExcluded = (z, zones) => {
      for(let zone of zones) {
          if (z >= zone[0] - 2 && z <= zone[1] + 2) return true;
      }
      return false;
  };

  for(let i=-3; i<12; i++) {
      const z = 40 - (i*25);
      
      let y = 0;
      if (z < -140 && z > -230) {
          const rampLen = -90; 
          const dist = z - (-140);
          const t = dist / rampLen;
          y = -12 * t;
      } 
      else if (z > 40 && z < 100) {
          const rampLen = 40; 
          const dist = z - 40;
          const t = Math.min(1, dist / rampLen);
          y = -12 * t;
      }
      y = Math.max(-12, y);

      createLamp(-8, z, Math.PI/2, city, y);
      if (!isExcluded(z + 12, exclusionZonesLeft)) {
          createVoxelTree(-12, z + 12, city);
      }
      createLamp(28, z, -Math.PI/2, city, y);
      if (!isExcluded(z + 12, exclusionZonesRight)) {
          createVoxelTree(32, z + 12, city);
      }
  }

  createDetailedBrickBuilding(-25, 30, 8, 25, 25, '#8B4513', city); 
  createDetailedBrickBuilding(-25, -90, 6, 22, 22, '#553333', city); 
  createDetailedBrickBuilding(45, 40, 5, 25, 20, '#A0522D', city); 
  createDetailedBrickBuilding(45, -80, 10, 25, 25, '#708090', city); 
  createBrutalistBlock(45, -160, 40, 25, city); 
  createDetailedGlassTower(-25, -10, 10, 20, '#88CCFF', city); 
  createDetailedGlassTower(45, 0, 12, 25, '#AAFFAA', city); 
  createDetailedGlassTower(45, -120, 8, 30, '#AACCDD', city); 
  createStackedApartments(-30, -140, city);

  const th = new THREE.Group(); th.position.set(45, 0, -40);
  const thColor = '#A05040'; 
  createBox(25, 25, 30, thColor, 0, 12.5, 0, th);
  createBox(25, 40, 15, thColor, 0, 20, 7.5, th);
  for(let i=0; i<5; i++) {
     createBox(1, 25, 1, '#D08070', -10 + (i*5), 12.5, -15.1, th); 
  }
  const marq = createBox(6, 6, 14, '#FF1493', -13, 8, -5, th); marq.rotation.z = 0.1;
  marq.material.emissive = new THREE.Color('#880044');
  createPlane(0.1, 4, 'white', -14, 8, -5, 0, th).rotation.y = Math.PI/2;
  createBox(18, 1, 8, '#333', 0, 4, -16, th);
  createBox(0.5, 4, 0.5, '#D4AF37', 8, 2, -19, th);
  createBox(0.5, 4, 0.5, '#D4AF37', -8, 2, -19, th);
  city.add(th);
  
  createTunnelSignage(env); 

  // --- NEWS TOWER & HELICOPTER ---
  const padPos = createNewsTower(city);
  const heli = new NewsHelicopter(city, padPos, audioGenerator);
  animatedObjects.push(heli);

  env.add(city);
  
  const traffic = new TrafficSystem(city, audioGenerator);
  animatedObjects.push(traffic);

  const heroTaxi = new HeroTaxi(scene, audioGenerator);
  animatedObjects.push(heroTaxi);

  scene.add(env);
}