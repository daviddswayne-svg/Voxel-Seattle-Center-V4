
import * as THREE from 'three';
import { createCarMesh } from './assets.js';
import { TRAIN_LENGTH_RATIO, CAR_GAP, CarType } from './constants.js';

export class Train {
    constructor(config, curve, scene, audioGenerator) {
        this.config = config;
        this.curve = curve;
        this.scene = scene;
        
        this.progress = config.initialProgress || 0;
        this.speed = config.speed || 0.1;
        this.direction = config.direction || 1; // 1 for forward, -1 for backward
        this.color = config.color || '#ff0000';
        
        this.cars = [];
        this.group = new THREE.Group();
        scene.add(this.group);

        // Define Train Composition: HEAD - BODY - BODY - TAIL
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
                // Index 0 is the "front" in terms of T-value calculations
                offset: i * (TRAIN_LENGTH_RATIO + CAR_GAP)
            });
            
            this.group.add(meshGroup);
        });
    }

    update(delta) {
        // Shuttle Logic (Ping-Pong)
        const speedScale = 0.1; // normalize speed to track length
        
        this.progress += this.direction * this.speed * delta * speedScale;

        // Bounce at ends of track
        if (this.progress > 1.0) {
            this.progress = 1.0;
            this.direction = -1;
        } else if (this.progress < 0.0) {
            this.progress = 0.0;
            this.direction = 1;
        }

        // Update Car Positions
        this.cars.forEach((car, index) => {
            if (!this.curve || !this.curve.getPointAt) return;

            // Calculate 't' for this car. 
            // We assume car[0] is at 'this.progress' and others trail behind it relative to the track curve.
            // Note: When moving backwards (direction -1), this simple offset logic means the train 
            // visually moves "tail first" which is correct for a bi-directional monorail without physically rotating the train.
            const t = this.progress - (index * (TRAIN_LENGTH_RATIO + CAR_GAP) * this.direction);
            
            // Clamp to stay on track (prevent errors if slightly out of bounds during turn-around)
            const clampedT = Math.max(0.001, Math.min(0.999, t));
            
            const position = this.curve.getPointAt(clampedT);
            const tangent = this.curve.getTangentAt(clampedT);
            
            if (position && tangent && typeof position.x === 'number') {
                car.group.position.copy(position);
                
                // Orient car to face the direction of the track tangent
                // If direction is -1, the train is moving against the tangent, so we look backwards
                const lookTarget = position.clone();
                if (this.direction === 1) {
                    lookTarget.add(tangent);
                } else {
                    lookTarget.sub(tangent);
                }
                
                car.group.lookAt(lookTarget);
            }
        });
    }

    getCameraTarget() {
        // Determine which car is "leading" to attach the camera to
        // If direction is 1, index 0 is front. If -1, index 3 is front.
        const leadCarIndex = this.direction === 1 ? 0 : 3;
        const car = this.cars[leadCarIndex];
        
        if (!car) return { position: new THREE.Vector3(), lookAt: new THREE.Vector3() };
        
        const pos = car.group.position.clone();
        
        // Calculate camera offset relative to the car's orientation
        // We want the camera "behind" and "above" the car.
        // Since we oriented the car using lookAt, its local +Z is "forward" (visually).
        // Actually, createCarMesh puts the nose at +Z.
        // So "Behind" is -Z.
        
        const offset = new THREE.Vector3(0, 6, -18); 
        offset.applyQuaternion(car.group.quaternion);
        
        const camPos = pos.clone().add(offset);
        const lookAt = pos.clone().add(new THREE.Vector3(0, 2, 0)); // Look slightly above track level
        
        return { position: camPos, lookAt: lookAt };
    }
}
