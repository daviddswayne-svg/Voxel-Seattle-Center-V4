
import * as THREE from 'three';

class SoundGenerator {
  constructor(listener) {
    this.listener = listener;
    this.context = listener.context;
    this.buffers = {};
    this.sounds = []; // Track all created sounds
  }

  async init() {
    this.buffers['TRAFFIC'] = this.createTrafficBuffer();
    this.buffers['TRAIN'] = this.createTrainBuffer();
    this.buffers['ELEVATOR'] = this.createElevatorBuffer();
    this.buffers['MOPOP'] = this.createMoPopBuffer();
  }

  createBuffer(duration, renderCallback) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    renderCallback(data, sampleRate);
    return buffer;
  }

  createTrafficBuffer() {
    // 2 Seconds loop: Low engine rumble
    return this.createBuffer(2.0, (data, rate) => {
      let lastOut = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        const white = Math.random() * 2 - 1;
        // Brown noise filter
        const brown = (lastOut + (0.02 * white)) / 1.02;
        lastOut = brown;
        // Engine hum (60Hz)
        const hum = Math.sin(t * 2 * Math.PI * 60) * 0.3;
        data[i] = (brown * 0.5) + (hum * 0.5); 
      }
    });
  }

  createTrainBuffer() {
    // 1 Second loop: Electric Whine + Track Clack
    return this.createBuffer(1.0, (data, rate) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        // Motor Whine (Sawtooth-ish)
        const freq = 400;
        const whine = (t * freq % 1) * 2 - 1;
        // Track Noise
        const track = (Math.random() * 2 - 1) * 0.2;
        // Clacking rhythm
        const rhythm = (Math.sin(t * Math.PI * 4) > 0.8) ? 0.3 : 0.0;
        data[i] = (whine * 0.1) + track + (track * rhythm);
      }
    });
  }

  createElevatorBuffer() {
    // 4 Second loop: Heavy Machinery Hum + Wind
    return this.createBuffer(4.0, (data, rate) => {
      let lastNoise = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        
        // 1. Low Drone (Motor)
        // 60Hz fundamental + harmonic
        const drone = Math.sin(2 * Math.PI * 60 * t) * 0.2 
                    + Math.sin(2 * Math.PI * 120 * t) * 0.1;
                    
        // 2. Wind / Air Resistance (Filtered Noise)
        const white = Math.random() * 2 - 1;
        // Simple low-pass filter
        const noise = (lastNoise + (0.1 * white)) / 1.1;
        lastNoise = noise;
        
        // Modulate wind volume slowly to simulate movement variations
        const windSwell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.25 * t);
        
        // 3. High Pitch Whine (Electric Actuator)
        const whine = Math.sin(2 * Math.PI * 800 * t) * 0.05;

        data[i] = (drone * 0.6) + (noise * 2.0 * windSwell) + whine; 
      }
    });
  }

  createMoPopBuffer() {
    // 2.0 Second loop: Synth Drum Beat (120 BPM)
    return this.createBuffer(2.0, (data, rate) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        
        // 1. KICK (Simple 4/4) - Hits at 0.0, 0.5, 1.0, 1.5
        const beatDuration = 0.5; 
        const kickT = t % beatDuration;
        let kick = 0;
        if (kickT < 0.2) {
             const env = Math.exp(-kickT * 20); // Exponential decay
             const freq = 120 * Math.exp(-kickT * 25); // Pitch drop
             kick = Math.sin(2 * Math.PI * freq * kickT) * env;
        }

        // 2. SNARE (Backbeat) - Hits at 0.5, 1.5
        const barT = t % 2.0; 
        let snare = 0;
        let snareT = -1;
        if (barT >= 0.5 && barT < 1.0) snareT = barT - 0.5;
        if (barT >= 1.5 && barT < 2.0) snareT = barT - 1.5;

        if (snareT >= 0 && snareT < 0.2) {
            const env = Math.exp(-snareT * 30);
            const noise = (Math.random() * 2 - 1);
            snare = noise * env;
        }

        // 3. HI-HAT (16th notes)
        const sixteenthT = t % 0.125;
        let hat = 0;
        if (sixteenthT < 0.05) {
             const env = Math.exp(-sixteenthT * 80); // Very short
             const noise = (Math.random() * 2 - 1);
             hat = noise * env * 0.4; 
        }
        
        // 4. SYNTH ARPEGGIO (Square wave bubbling)
        const noteIdx = Math.floor(t / 0.125);
        // Pentatonic sequence
        const notes = [220, 261, 329, 392, 440, 392, 329, 261, 220, 196, 220, 261, 329, 440, 523, 440];
        const freq = notes[noteIdx % notes.length];
        const synthT = sixteenthT;
        let synth = 0;
        if (synthT < 0.1) {
             const env = Math.exp(-synthT * 10);
             const osc = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1); // Square wave
             const sine = Math.sin(2 * Math.PI * freq * t);
             // Mix square and sine for "plucky" sound
             synth = (osc * 0.3 + sine * 0.7) * env * 0.15;
        }

        data[i] = (kick * 0.8) + (snare * 0.5) + (hat * 0.3) + synth;
      }
    });
  }

  createPositionalAudio(type, refDistance, maxDistance, volume = 1.0) {
     if (!this.buffers[type]) return null;
     
     const sound = new THREE.PositionalAudio(this.listener);
     sound.setBuffer(this.buffers[type]);
     sound.setRefDistance(refDistance); 
     sound.setMaxDistance(maxDistance);
     sound.setLoop(true);
     sound.setVolume(volume);
     
     this.sounds.push(sound); // Track it
     
     return sound;
  }

  startAll() {
      // Start all sounds that aren't playing
      this.sounds.forEach(sound => {
          if (!sound.isPlaying) {
              sound.play();
          }
      });
  }
}

export const setupAudio = (camera) => {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    
    // Start muted
    listener.setMasterVolume(0);

    const generator = new SoundGenerator(listener);
    generator.init();

    return { listener, generator };
};
