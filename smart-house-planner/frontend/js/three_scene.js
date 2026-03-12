/**
 * three_scene.js  (ES Module)
 * ---------------------------
 * Three.js 3D visualization for the Smart House Layout Planner.
 *
 * Loaded as <script type="module"> so we can use proper ES imports.
 * Exposes helpers to window.* so the rest of the app (plain JS) can call them.
 *
 * Fixes applied vs. v1:
 *  - Correct ES-module imports for Three.js + OrbitControls
 *  - Use requestAnimationFrame to defer init until container is laid out
 *  - Fallback roundRect polyfill for older browsers
 *  - Container height fixed via explicit CSS; also read from offsetHeight
 *  - Proper re-initialisation guard
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

"use strict";

/* ── Constants ── */
const WALL_H = 2.8;    // wall height in metres
const WALL_T = 0.15;   // wall thickness

/* ── Module-level state ── */
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let animId = null;
let container = null;
let _currentLayout = null;

/* ── roundRect polyfill (Chrome <99 / Firefox <112) ── */
function canvasRoundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}

/* ────────────────────────────────────────────────────────────────
   PUBLIC API
   ──────────────────────────────────────────────────────────────── */

function initThreeScene(layout) {
    _currentLayout = layout;
    // Defer one frame so the container is rendered and has real dimensions
    requestAnimationFrame(() => _buildScene(layout));
}

function updateThreeScene(layout) {
    initThreeScene(layout);
}

function disposeThree() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }

    if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
    }

    if (scene) {
        scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        scene = null;
    }

    if (controls) { controls.dispose(); controls = null; }
    camera = null;
    container = null;
    window.removeEventListener("resize", onWindowResize);
}

/* ── Expose to window so plain-JS modules can call them ── */
window.initThreeScene = initThreeScene;
window.updateThreeScene = updateThreeScene;
window.disposeThree = disposeThree;

/* ────────────────────────────────────────────────────────────────
   PRIVATE — Scene Construction
   ──────────────────────────────────────────────────────────────── */

function _buildScene(layout) {
    disposeThree();   // clean up any previous scene

    container = document.getElementById("threeContainer");
    if (!container) return;

    /* Get real dimensions — offsetWidth/Height works even when flexbox
       has just made the element visible.  Fall back to parent size. */
    let W = container.offsetWidth || container.parentElement?.offsetWidth || 800;
    let H = container.offsetHeight || container.parentElement?.offsetHeight || 600;
    // Subtract toolbar height (≈40px) when parent is the flex wrapper
    if (H < 50) H = 500;

    /* ── Renderer ── */
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0D0F1A, 1);
    container.appendChild(renderer.domElement);

    /* ── Scene ── */
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0D0F1A, 25, 90);

    /* ── Camera ── */
    const cx = layout.house_width / 2;
    const cz = layout.house_height / 2;
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    camera.position.set(
        cx + layout.house_width * 0.9,
        WALL_H * 3,
        cz + layout.house_height * 0.9
    );
    camera.lookAt(cx, 0, cz);

    /* ── OrbitControls ── */
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.update();

    /* ── Lights ── */
    _addLights(cx, cz);

    /* ── Geometry ── */
    _addHouseFloor(layout);
    layout.rooms.forEach(r => _addRoom3D(r));

    /* ── Resize ── */
    window.addEventListener("resize", onWindowResize);

    /* ── Animate ── */
    _animate();
}

/* ────────────────────────────────────────────────────────────────
   PRIVATE — Lights
   ──────────────────────────────────────────────────────────────── */

function _addLights(cx, cz) {
    // Ambient
    scene.add(new THREE.AmbientLight(0x8090c0, 0.7));

    // Main directional (with shadows)
    const dir = new THREE.DirectionalLight(0xfff5e0, 1.3);
    dir.position.set(cx + 12, 22, cz + 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 100;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    scene.add(dir);

    // Accent fill
    const fill = new THREE.PointLight(0x6366F1, 1.0, 30);
    fill.position.set(cx, WALL_H * 0.9, cz);
    scene.add(fill);

    // Hemisphere (sky / ground)
    scene.add(new THREE.HemisphereLight(0x3344aa, 0x112233, 0.5));
}

/* ────────────────────────────────────────────────────────────────
   PRIVATE — Geometry Helpers
   ──────────────────────────────────────────────────────────────── */

function _addHouseFloor(layout) {
    const geo = new THREE.PlaneGeometry(layout.house_width, layout.house_height);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1B1E30, roughness: 0.95, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(layout.house_width / 2, -0.01, layout.house_height / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Subtle grid overlay on floor
    const gridHelper = new THREE.GridHelper(
        Math.max(layout.house_width, layout.house_height),
        Math.max(layout.house_width, layout.house_height),
        0x333355,
        0x222244
    );
    gridHelper.position.set(layout.house_width / 2, 0, layout.house_height / 2);
    scene.add(gridHelper);
}

function _addRoom3D(room) {
    const color = parseInt(room.color.replace("#", ""), 16);
    const { x: rx, y: rz, width: rw, height: rd } = room;

    /* Floor tile */
    const floorGeo = new THREE.PlaneGeometry(rw - 0.06, rd - 0.06);
    const floorMat = new THREE.MeshStandardMaterial({
        color, roughness: 0.8, metalness: 0.05, opacity: 0.6, transparent: true,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(rx + rw / 2, 0.01, rz + rd / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    /* Walls */
    _buildWalls(room, color);

    /* Room label billboard */
    _addRoomLabel(room.name, rx + rw / 2, WALL_H, rz + rd / 2, color);

    /* Furniture */
    (room.furniture || []).forEach(f => _addFurniture3D(f, room));
}

function _buildWalls(room, color) {
    const { x: rx, y: rz, width: rw, height: rd } = room;
    const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.65, metalness: 0.1, opacity: 0.75, transparent: true,
    });
    // Share material across the 4 walls of this room for performance
    _addWall(rx, rz, rw, WALL_T, mat);  // North
    _addWall(rx, rz + rd - WALL_T, rw, WALL_T, mat);  // South
    _addWall(rx, rz, WALL_T, rd, mat);  // West
    _addWall(rx + rw - WALL_T, rz, WALL_T, rd, mat);  // East
}

function _addWall(wx, wz, ww, wd, mat) {
    const geo = new THREE.BoxGeometry(ww, WALL_H, wd);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx + ww / 2, WALL_H / 2, wz + wd / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
}

/* ── Room label as a canvas-texture quad that always faces up ── */
function _addRoomLabel(text, x, y, z, color) {
    const cvs = document.createElement("canvas");
    cvs.width = 256;
    cvs.height = 64;
    const ctx = cvs.getContext("2d");

    // Background pill
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}55`;
    ctx.beginPath();
    canvasRoundRect(ctx, 4, 4, 248, 56, 12);
    ctx.fill();

    // Text
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(cvs);
    const geo = new THREE.PlaneGeometry(2.5, 0.55);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const sprite = new THREE.Mesh(geo, mat);
    sprite.position.set(x, y + 0.3, z);
    // Face camera-friendly: lie flat on top of walls
    sprite.rotation.x = -Math.PI / 2.4;
    scene.add(sprite);
}

/* ── Furniture ── */
const FURNITURE_DEFS = {
    bed: { h: 0.55, color: 0x8B7355 },
    sofa: { h: 0.70, color: 0x4A5568 },
    table: { h: 0.75, color: 0x92400E },
    chair: { h: 0.85, color: 0x374151 },
    tv: { h: 1.10, color: 0x111827 },
    fridge: { h: 1.70, color: 0xD1D5DB },
    desk: { h: 0.78, color: 0x78350F },
    wardrobe: { h: 2.00, color: 0x6B5344 },
    bathtub: { h: 0.50, color: 0xE5E7EB },
    toilet: { h: 0.80, color: 0xF3F4F6 },
    sink: { h: 0.90, color: 0xCBD5E1 },
    stove: { h: 0.90, color: 0x1F2937 },
    bookshelf: { h: 1.80, color: 0x92400E },
    plant: { h: 0.80, color: 0x065F46 },
};

function _addFurniture3D(f, room) {
    const baseId = f.id.split("_")[0];
    const def = FURNITURE_DEFS[baseId] || { h: 0.8, color: 0x556677 };
    const fw = f.rotation === 90 ? f.height : f.width;
    const fd = f.rotation === 90 ? f.width : f.height;
    const fh = def.h;

    const geo = new THREE.BoxGeometry(Math.max(fw - 0.1, 0.1), fh, Math.max(fd - 0.1, 0.1));
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(room.x + f.x + fw / 2, fh / 2, room.y + f.y + fd / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Edge outline
    const edges = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.12, transparent: true })
    ));
}

/* ── Animation loop ── */
function _animate() {
    animId = requestAnimationFrame(_animate);
    controls.update();
    renderer.render(scene, camera);
}

/* ── Window resize ── */
function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const W = container.offsetWidth || 800;
    const H = container.offsetHeight || 500;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
}
