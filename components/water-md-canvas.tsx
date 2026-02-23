"use client";

/**
 * WaterMDCanvas — 3D liquid water stick-model background visualization.
 *
 * Renders a dense cluster of ~60 H₂O molecules in stick-model style
 * (like PyMOL / VESTA output) with CPK-inspired coloring. The entire
 * cluster rotates slowly, resembling a molecular structure being
 * examined in a scientific viewer.
 *
 * Visual style matches reference: thin cylindrical bonds as the dominant
 * visual element, small atom caps at vertices, muted scientific coloring.
 * Dense packing mimics a liquid water simulation snapshot.
 *
 * Design choices:
 *   - Stick-dominant: bonds are thick relative to atom caps (like the
 *     reference protein stick model)
 *   - CPK coloring: red oxygen, white hydrogen, light gray bonds
 *   - Dense packing: molecules overlap and interweave like real liquid
 *   - Slow uniform rotation: the whole scene rotates as a rigid body,
 *     like rotating a structure in PyMOL — deliberate, not bouncy
 *   - Subtle Brownian drift on individual molecules for "alive" feel
 *   - Fog for depth: far molecules fade, creating depth layering
 *   - Low container opacity (~0.18) so text stays dominant
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Scene parameters
// ---------------------------------------------------------------------------

const NUM_MOLECULES = 60;

/** Cluster radius — molecules are distributed in a sphere of this radius. */
const CLUSTER_RADIUS = 12;

/** H₂O stick-model geometry. */
const BOND_LEN = 0.58;
const BOND_ANGLE_RAD = 104.5 * (Math.PI / 180);

/** Stick-model sizing: bonds are visually dominant, atom caps are small. */
const STICK_RADIUS = 0.06;
const O_CAP_RADIUS = 0.13;
const H_CAP_RADIUS = 0.09;

/** Slow Brownian drift — molecules wobble gently in place. */
const DRIFT_SPEED = 0.002;
const DRIFT_DAMPING = 0.985;

// ---------------------------------------------------------------------------
// Materials — muted CPK coloring for scientific credibility
// ---------------------------------------------------------------------------

function buildMaterials() {
  const oMat = new THREE.MeshPhongMaterial({
    color: 0xcc3333,
    shininess: 40,
    specular: 0x442222,
  });

  const hMat = new THREE.MeshPhongMaterial({
    color: 0xe8e8e8,
    shininess: 30,
    specular: 0x333333,
  });

  const bondMat = new THREE.MeshPhongMaterial({
    color: 0xaaaaaa,
    shininess: 20,
    specular: 0x222222,
  });

  return { oMat, hMat, bondMat };
}

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

function buildGeometry() {
  const oGeo = new THREE.SphereGeometry(O_CAP_RADIUS, 12, 10);
  const hGeo = new THREE.SphereGeometry(H_CAP_RADIUS, 8, 6);
  const bondGeo = new THREE.CylinderGeometry(STICK_RADIUS, STICK_RADIUS, 1, 6, 1);
  return { oGeo, hGeo, bondGeo };
}

// ---------------------------------------------------------------------------
// Molecule state (for subtle drift animation)
// ---------------------------------------------------------------------------

interface MolDrift {
  offset: THREE.Vector3;
  vel: THREE.Vector3;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Place a unit-height cylinder between two world-space points. */
function placeBond(
  mesh: THREE.Mesh,
  a: THREE.Vector3,
  b: THREE.Vector3
) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.scale.set(1, len, 1);
  mesh.position.lerpVectors(a, b, 0.5);
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, dir.normalize());
}

/** Distribute points in a sphere using a spiral method. */
function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const radial = radius * (0.4 + Math.random() * 0.6);
    points.push(
      new THREE.Vector3(
        Math.cos(theta) * r * radial,
        y * radial,
        Math.sin(theta) * r * radial
      )
    );
  }
  return points;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaterMDCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0e17, 0.025);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0, 0, 30);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // --- Lighting (clinical, like a structure viewer) ---
    scene.add(new THREE.AmbientLight(0x606878, 1.0));

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 12, 15);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x9999bb, 0.4);
    fill.position.set(-10, -4, 8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x4466aa, 0.3);
    rim.position.set(0, -10, -10);
    scene.add(rim);

    // --- Build molecules ---
    const { oMat, hMat, bondMat } = buildMaterials();
    const { oGeo, hGeo, bondGeo } = buildGeometry();

    const clusterGroup = new THREE.Group();
    scene.add(clusterGroup);

    const centers = fibonacciSphere(NUM_MOLECULES, CLUSTER_RADIUS);
    const drifts: MolDrift[] = [];

    const halfAngle = BOND_ANGLE_RAD / 2;
    const h1Local = new THREE.Vector3(
      Math.sin(halfAngle) * BOND_LEN,
      Math.cos(halfAngle) * BOND_LEN,
      0
    );
    const h2Local = new THREE.Vector3(
      -Math.sin(halfAngle) * BOND_LEN,
      Math.cos(halfAngle) * BOND_LEN,
      0
    );

    for (let i = 0; i < NUM_MOLECULES; i++) {
      const molGroup = new THREE.Group();

      const randomRot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      molGroup.setRotationFromEuler(randomRot);

      // Oxygen cap
      molGroup.add(new THREE.Mesh(oGeo, oMat));

      // Hydrogen caps
      const h1Mesh = new THREE.Mesh(hGeo, hMat);
      h1Mesh.position.copy(h1Local);
      molGroup.add(h1Mesh);

      const h2Mesh = new THREE.Mesh(hGeo, hMat);
      h2Mesh.position.copy(h2Local);
      molGroup.add(h2Mesh);

      // Bond sticks
      const b1 = new THREE.Mesh(bondGeo, bondMat);
      placeBond(b1, new THREE.Vector3(0, 0, 0), h1Local);
      molGroup.add(b1);

      const b2 = new THREE.Mesh(bondGeo, bondMat);
      placeBond(b2, new THREE.Vector3(0, 0, 0), h2Local);
      molGroup.add(b2);

      molGroup.position.copy(centers[i]);
      clusterGroup.add(molGroup);

      drifts.push({
        offset: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * DRIFT_SPEED,
          (Math.random() - 0.5) * DRIFT_SPEED,
          (Math.random() - 0.5) * DRIFT_SPEED
        ),
      });
    }

    // --- Sizing ---
    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();
    window.addEventListener("resize", resize);

    // --- Animation ---
    let frameId = 0;
    let t = 0;

    function animate() {
      frameId = requestAnimationFrame(animate);
      t += 0.0008;

      // Very slow rigid-body rotation of the entire cluster
      clusterGroup.rotation.y = t * 0.6;
      clusterGroup.rotation.x = Math.sin(t * 0.4) * 0.15;

      // Gentle per-molecule Brownian drift
      const children = clusterGroup.children;
      for (let i = 0; i < drifts.length; i++) {
        const d = drifts[i];
        d.vel.x += (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
        d.vel.y += (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
        d.vel.z += (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
        d.vel.multiplyScalar(DRIFT_DAMPING);

        d.offset.add(d.vel);
        // Soft spring back toward home position to prevent wandering
        d.offset.multiplyScalar(0.998);

        if (children[i]) {
          children[i].position.copy(centers[i]).add(d.offset);
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      oGeo.dispose();
      hGeo.dispose();
      bondGeo.dispose();
      oMat.dispose();
      hMat.dispose();
      bondMat.dispose();
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      aria-hidden="true"
    />
  );
}
