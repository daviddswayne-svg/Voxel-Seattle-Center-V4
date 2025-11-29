import * as THREE from 'three';
import { createCarMesh } from './assets.js';
import { TRAIN_LENGTH_RATIO, CAR_GAP, CarType } from './constants.js';

export class Train {
    constructor(config, curve, scene, audioGenerator) {
        this.config = config;
        this.curve = curve;
        this.scene = scene;
        
        // Train geometry constants
        // TRAIN_LENGTH_RATIO is approx 0.01 (representing ~4.5 units of length)
        // Total span of the train in T-space (0 to 1)
        this.TRAIN_SPAN = 3 * (TRAIN_LENGTH_RATIO + CAR_GAP);
        
        // Stops buffer: 0.01 is approx 5-6 units of distance.
        // Car half-length is ~2.25. Bumper is ~0.5 thick. 
        // 0.01 leaves ~1.5 - 2.0 units visual gap.
        this.TRACK_BUFFER = 0.01; 

        // Initial progress clamping
        this.progress = config.initialProgress || 0;
        this.progress = Math.max(this.TRAIN_SPAN + this.TRACK_BUFFER, Math.min(1.0 - this.TRACK_BUFFER, this.progress));

        this.speed = config.speed || 0.1;
        this.direction = config.direction || 1; // 1 for forward, -1 for backward
        this.color = config.color || '#ff0000';
        
        // State Machine for Station Stops
        this.state = 'MOVING'; // 'MOVING' or 'STOPPED'
        this.stopTimer = 0;
        this.STOP_DURATION = 5.0; // 5 seconds pause

        this.cars = [];
        this.group = new THREE.Group();
        scene.add(this.group);

        // Define Train Composition: HEAD - BODY - BODY - TAIL
        // Car 0 is the "Forward" Lead (Head). Car 3 is the "Backward" Lead (Tail).
        const carTypes = [CarType.HEAD, CarType.BODY, CarType.BODY, CarType.TAIL];
        
        carTypes.forEach((type, i) => {
            const meshGroup = createCarMesh(type, this.color);
            
            // Attach audio to the lead car (index 0)
            if (i === 0 && audioGenerator) {
                // Use 'TRAIN' sound buffer (Electric Whine + Track Clack)
                const sound = audioGenerator.createPositionalAudio('TRAIN', 20, 500, 0.5);
                if (sound) meshGroup.add(sound);
            }

            this.cars.push({
                group: meshGroup,
                type: type,
                // Index 0 is always at 'this.progress'.
                // Subsequent cars are trailed behind (lower T value) by fixed offsets.
                offset: i * (TRAIN_LENGTH_RATIO + CAR_GAP)
            });
            
            this.group.add(meshGroup);
        });

        // Initialize positions immediately to prevent visual glitches on first frame
        this.updateCarPositions();
    }

    update(delta) {
        if (isNaN(delta)) return;

        // Station Stop Logic
        if (this.state === 'STOPPED') {
            this.stopTimer -= delta;
            if (this.stopTimer <= 0) {
                this.state = 'MOVING';
                // Direction was already flipped when we entered STOPPED state
            }
            return; // Train stays stationary
        }

        const speedScale = 0.1; // normalize speed to track length
        
        // Move train based on direction
        this.progress += this.direction * this.speed * delta * speedScale;

        // Check Track Limits (Station Stops) with Buffers
        const maxProgress = 1.0 - this.TRACK_BUFFER;
        const minProgress = this.TRAIN_SPAN + this.TRACK_BUFFER;

        // Upper Limit (Station B)
        if (this.progress >= maxProgress) {
            this.progress = maxProgress;
            this.direction = -1; // Reverse direction
            this.state = 'STOPPED';
            this.stopTimer = this.STOP_DURATION;
        } 
        // Lower Limit (Station A)
        // Ensure the tail (Car 3) doesn't hit the start bumper
        else if (this.progress <= minProgress) {
            this.progress = minProgress;
            this.direction = 1; // Forward direction
            this.state = 'STOPPED';
            this.stopTimer = this.STOP_DURATION;
        }

        this.updateCarPositions();
    }

    updateCarPositions() {
        if (!this.curve || !this.curve.getPointAt) return;

        this.cars.forEach((car) => {
            // Calculate T for this car.
            const t = this.progress - car.offset;
            
            if (isNaN(t)) return;

            // Safety Clamp to ensure getPointAt doesn't fail
            const clampedT = Math.max(0.0001, Math.min(0.9999, t));
            
            const position = this.curve.getPointAt(clampedT);
            const tangent = this.curve.getTangentAt(clampedT);
            
            // Explicit checks for position AND tangent being valid objects with x,y,z
            if (position && typeof position.x === 'number' && 
                tangent && typeof tangent.x === 'number') {
                
                car.group.position.copy(position);
                
                // Safe lookAt
                const lookTarget = position.clone().add(tangent);
                if (lookTarget && typeof lookTarget.x === 'number') {
                    car.group.lookAt(lookTarget);
                }
            }
        });
    }

    getCameraTarget() {
        // Determine which car is physically leading the movement
        // If Dir=1 (0->1), Car 0 (Head) is front.
        // If Dir=-1 (1->0), Car 3 (Tail) is front.
        const leadCarIndex = this.direction === 1 ? 0 : 3;
        const car = this.cars[leadCarIndex];
        
        if (!car) return { position: new THREE.Vector3(), lookAt: new THREE.Vector3() };
        
        // Camera Positioning (Unobstructed View)
        let localPos, lookDir;

        if (this.direction === 1) {
            // Riding in Car 0 (Head), looking Forward (+Z in local car space)
            // Position just in front of windshield to be unobstructed
            localPos = new THREE.Vector3(0, 2.2, 2.8); 
            lookDir = new THREE.Vector3(0, 0, 1);
        } else {
            // Riding in Car 3 (Tail), looking Backward (-Z in local car space)
            // Position just in front (technically behind) of rear windshield
            localPos = new THREE.Vector3(0, 2.2, -2.8);
            lookDir = new THREE.Vector3(0, 0, -1);
        }
        
        // Transform to World Space
        const worldPos = car.group.position.clone();
        worldPos.add(localPos.applyQuaternion(car.group.quaternion));

        const lookAt = worldPos.clone();
        const worldLookDir = lookDir.applyQuaternion(car.group.quaternion);
        lookAt.add(worldLookDir.multiplyScalar(50)); // Look 50 units ahead
        lookAt.y -= 5; // Slight tilt down

        return { position: worldPos, lookAt: lookAt };
    }
}