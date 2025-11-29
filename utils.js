import * as THREE from 'three';

// Helper to replace <mesh><boxGeometry args={[w,h,d]} /><meshStandardMaterial color={c} /></mesh>
export function createBox(w, h, d, color, x = 0, y = 0, z = 0, parent = null) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color: color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

// Helper for cylinders
export function createCylinder(rt, rb, h, seg, color, x = 0, y = 0, z = 0, parent = null) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  const mat = new THREE.MeshStandardMaterial({ color: color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

// Helper for planes
export function createPlane(w, h, color, x = 0, y = 0, z = 0, rotX = 0, parent = null) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({ color: color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rotX;
  mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

// --- PERLIN NOISE IMPLEMENTATION ---
export class Noise {
  constructor(seed = Math.random()) {
    this.grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    this.p = [];
    for (let i=0; i<256; i++) {
      this.p[i] = Math.floor(Math.random()*256);
    }
    // To remove the need for index wrapping, double the permutation table length
    this.perm = [];
    for(let i=0; i<512; i++) {
      this.perm[i] = this.p[i & 255];
    }
  }

  dot(g, x, y, z) {
    return g[0]*x + g[1]*y + g[2]*z;
  }

  mix(a, b, t) {
    return (1.0-t)*a + t*b;
  }

  fade(t) {
    return t*t*t*(t*(t*6.0-15.0)+10.0);
  }

  perlin3(x, y, z) {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    let Z = Math.floor(z);
    
    x = x - X;
    y = y - Y;
    z = z - Z;
    
    X = X & 255;
    Y = Y & 255;
    Z = Z & 255;

    let gi000 = this.perm[X+this.perm[Y+this.perm[Z]]] % 12;
    let gi001 = this.perm[X+this.perm[Y+this.perm[Z+1]]] % 12;
    let gi010 = this.perm[X+this.perm[Y+1+this.perm[Z]]] % 12;
    let gi011 = this.perm[X+this.perm[Y+1+this.perm[Z+1]]] % 12;
    let gi100 = this.perm[X+1+this.perm[Y+this.perm[Z]]] % 12;
    let gi101 = this.perm[X+1+this.perm[Y+this.perm[Z+1]]] % 12;
    let gi110 = this.perm[X+1+this.perm[Y+1+this.perm[Z]]] % 12;
    let gi111 = this.perm[X+1+this.perm[Y+1+this.perm[Z+1]]] % 12;

    let n000 = this.dot(this.grad3[gi000], x, y, z);
    let n001 = this.dot(this.grad3[gi001], x, y, z-1);
    let n010 = this.dot(this.grad3[gi010], x, y-1, z);
    let n011 = this.dot(this.grad3[gi011], x, y-1, z-1);
    let n100 = this.dot(this.grad3[gi100], x-1, y, z);
    let n101 = this.dot(this.grad3[gi101], x-1, y, z-1);
    let n110 = this.dot(this.grad3[gi110], x-1, y-1, z);
    let n111 = this.dot(this.grad3[gi111], x-1, y-1, z-1);

    let u = this.fade(x);
    let v = this.fade(y);
    let w = this.fade(z);

    let nx00 = this.mix(n000, n100, u);
    let nx01 = this.mix(n001, n101, u);
    let nx10 = this.mix(n010, n110, u);
    let nx11 = this.mix(n011, n111, u);

    let nxy0 = this.mix(nx00, nx10, v);
    let nxy1 = this.mix(nx01, nx11, v);

    let nxyz = this.mix(nxy0, nxy1, w);

    return nxyz;
  }
}