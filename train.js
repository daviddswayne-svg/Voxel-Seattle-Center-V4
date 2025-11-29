
import * as THREE from 'three';
import { createCarMesh } from './assets.js';
import { CarType, TRAIN_LENGTH_RATIO, CAR_GAP } from './constants.js';

export class Train {
  constructor(config, curve, scene, audioGenerator) {
    this.config = config;
    this.curve = curve;
    this.scene = scene;
    this.progress = config.initialProgress || 0.05;
    this.speed = config.speed;
    this.direction = config.direction;
    this.paused = false;
    this.pauseTimer = 0;
    this.stopDuration = 0;

    this.group = new THREE.Group();
    
    // Audio (Motor Whine)
    if (audioGenerator) {
        // refDistance 30 -> Louder
        const sound = audioGenerator.createPositionalAudio('TRAIN', 30, 200, 0.4);
        if (sound) this.group.add(sound);
    }

    this.scene.add(this.group);
    
    // Create 4 Car Groups
    this.cars = [];
    for (let i = 0; i < 4; i++) {
        const carGroup = new THREE.Group();
        this.group.add(carGroup);
        // Placeholders
        this.cars.push({ group: carGroup, mesh: null, type: null });
    }
    
    this.updateVisuals();
  }

  updateVisuals() {
    // Determine visual types based on direction
    const types = [CarType.BODY, CarType.BODY, CarType.BODY, CarType.BODY];
    if (this.direction === 1) {
        types[0] = CarType.HEAD;
        types[3] = CarType.TAIL;
    } else {
        types[0] = CarType.TAIL;
        types[3] = CarType.HEAD;
    }

    // Rebuild meshes if type changed
    this.cars.forEach((c, idx) => {
        if (c.type !== types[idx]) {
            if (c.mesh) c.group.remove(c.mesh);
            c.type = types[idx];
            c.mesh = createCarMesh(types[idx], this.config.color);
            c.group.add(c.mesh);
            
            // Add details to Head cars
            if (c.type === CarType.HEAD) {
                 // Undercarriage Detail
                 const acc = new THREE.Mesh(
                     new THREE.CylinderGeometry(0.85, 0.85, 0.7, 16), 
                     new THREE.MeshStandardMaterial({color:'#333', roughness:0.9})
                 );
                 acc.rotation.x = Math.PI/2;
                 acc.position.set(0, 0.5, -2.1);
                 c.mesh.add(acc);
            }
        }
    });
  }

  update(delta) {
    if (this.paused) {
      this.pauseTimer += delta;
      if (this.pauseTimer >= this.stopDuration) {
        this.paused = false;
        this.pauseTimer = 0;
        
        // Flip direction and visuals AFTER the wait
        this.direction *= -1;
        this.updateVisuals();
      }
    } else {
       this.progress += (this.speed * delta * this.direction * 0.05);

       // Upper Limit (Seattle Center) - Go deeper into station (0.99)
       if (this.progress > 0.99) {
         this.progress = 0.99;
         this.paused = true;
         this.stopDuration = 7 + Math.random() * 3; // 7-10 seconds wait
       } 
       // Lower Limit (Westlake) - Stop at 0.04 to keep lead car valid on track
       else if (this.progress < 0.04) {
         this.progress = 0.04;
         this.paused = true;
         this.stopDuration = 7 + Math.random() * 3; // 7-10 seconds wait
       }
    }

    // Update Car Positions
    this.cars.forEach((car, index) => {
        const t = this.progress - (index * (TRAIN_LENGTH_RATIO + CAR_GAP));
        const clampedT = Math.max(0, Math.min(1, t));
        
        const position = this.curve.getPointAt(clampedT);
        const tangent = this.curve.getTangentAt(clampedT);
        
        if (position && tangent) {
            car.group.position.copy(position);
            
            // Orient car based on direction so "Front" is always leading
            if (this.direction === 1) {
                car.group.lookAt(position.clone().add(tangent));
            } else {
                // Flip 180 so the "Front" (Head geometry) faces the new movement direction
                car.group.lookAt(position.clone().sub(tangent));
            }
        }
    });

    // Update Sound Position
    const sound = this.group.children.find(c => c.isAudio);
    if (sound) {
        // Position sound at the middle of the train
        const centerT = this.progress - (1.5 * (TRAIN_LENGTH_RATIO + CAR_GAP));
        const clampedCenter = Math.max(0, Math.min(1, centerT));
        const centerPos = this.curve.getPointAt(clampedCenter);
        if (centerPos) {
             sound.position.copy(centerPos);
        }
    }
  }

  getCameraTarget() {
      const leadIndex = this.direction === 1 ? 0 : 3;
      const leadCar = this.cars[leadIndex];
      
      const pos = leadCar.group.position.clone();
      
      // Because we now flip the car group in update(), 
      // the local Z axis (forward) always points in the direction of travel.
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(leadCar.group.quaternion);
      
      // Camera Offset: Moved to the nose tip to clear new geometry
      // Position Z: 3.8 (Clear of the 3.65 nose tip)
      // Position Y: 1.6 (Clear of bumper height)
      const offset = forward.clone().multiplyScalar(3.8).add(new THREE.Vector3(0, 1.6, 0));
      const eye = pos.clone().add(offset);
      
      // Look point: Further ahead on the track, slightly down
      const look = pos.clone().add(forward.clone().multiplyScalar(50)).add(new THREE.Vector3(0, -2, 0));
      
      return { position: eye, lookAt: look };
  }
}
