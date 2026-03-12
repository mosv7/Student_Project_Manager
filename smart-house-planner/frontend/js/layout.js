/**
 * layout.js
 * ---------
 * Central state manager for the Smart House Layout Planner.
 *
 * Responsibilities:
 *  - Room CRUD (add, edit, delete) before generation
 *  - API calls: generate layout, save/load, furniture library
 *  - Global state: currentLayout, selectedRoom, furnitureLibrary
 *  - Helpers: toast notifications, modal management, view switching
 *  - Export: JSON, canvas image
 */

"use strict";

/* ─── Global State ──────────────────────────────────────────── */
const State = {
    rooms: [],                // user-defined room configs
    currentLayout: null,      // {house_width, house_height, rooms:[]}
    selectedRoomName: null,   // currently selected room name
    furnitureLibrary: [],     // loaded from /furniture-library
    view: "2d",               // "2d" | "3d"
    layoutGenerated: false,
};

/* Pre-load colours (mirrors server-side palette) */
const ROOM_COLORS = [
    "#6366F1", "#EC4899", "#14B8A6", "#F59E0B",
    "#8B5CF6", "#10B981", "#F97316", "#3B82F6",
    "#EF4444", "#84CC16",
];

/* ─── Default rooms on first load ──────────────────────────── */
const DEFAULT_ROOMS = [
    { name: "Living Room", width: 5, height: 4, constraints: [] },
    { name: "Kitchen", width: 3, height: 3, constraints: ["near Living Room"] },
    { name: "Bedroom", width: 4, height: 4, constraints: [] },
    { name: "Bathroom", width: 2, height: 2, constraints: ["near Bedroom"] },
];

/* ─── Init ──────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    State.rooms = JSON.parse(JSON.stringify(DEFAULT_ROOMS));
    renderRoomList();
    loadFurnitureLibrary();
});

/* ─── Furniture Library ─────────────────────────────────────── */
async function loadFurnitureLibrary() {
    try {
        const res = await fetch("/furniture-library");
        const data = await res.json();
        State.furnitureLibrary = data.furniture || [];
        if (window.renderFurnitureGrid) window.renderFurnitureGrid();
    } catch (e) {
        console.warn("Could not load furniture library:", e);
        State.furnitureLibrary = [];
        if (window.renderFurnitureGrid) window.renderFurnitureGrid();
    }
}

/* ─── Room List Rendering ───────────────────────────────────── */
function renderRoomList() {
    const ul = document.getElementById("roomList");
    ul.innerHTML = "";
    State.rooms.forEach((r, i) => {
        const li = document.createElement("li");
        li.className = "room-item" + (r.name === State.selectedRoomName ? " selected" : "");
        li.id = `roomItem_${safeId(r.name)}`;
        li.onclick = () => selectRoom(r.name);

        const dot = document.createElement("span");
        dot.className = "room-color-dot";
        dot.style.background = r.color || ROOM_COLORS[i % ROOM_COLORS.length];

        const info = document.createElement("div");
        info.className = "room-item-info";
        info.innerHTML = `<div class="room-item-name">${escHtml(r.name)}</div>
                      <div class="room-item-size">${r.width}m × ${r.height}m</div>`;

        const editBtn = document.createElement("button");
        editBtn.className = "room-edit-btn";
        editBtn.title = "Edit room";
        editBtn.textContent = "✎";
        editBtn.onclick = (e) => { e.stopPropagation(); openEditRoomModal(r.name); };

        li.append(dot, info, editBtn);
        ul.appendChild(li);
    });
    updateColorLegend();
}

function updateColorLegend() {
    const legend = document.getElementById("colorLegend");
    legend.innerHTML = "";
    if (State.currentLayout) {
        State.currentLayout.rooms.forEach(r => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.innerHTML = `<span class="legend-dot" style="background:${r.color}"></span>
                        <span>${escHtml(r.name)}</span>`;
            legend.appendChild(item);
        });
    } else {
        State.rooms.forEach((r, i) => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.innerHTML = `<span class="legend-dot" style="background:${r.color || ROOM_COLORS[i % ROOM_COLORS.length]}"></span>
                        <span>${escHtml(r.name)}</span>`;
            legend.appendChild(item);
        });
    }
}

/* ─── Room Selection ────────────────────────────────────────── */
function selectRoom(name) {
    State.selectedRoomName = name;
    renderRoomList();
    updateRoomInfoPanel();
    if (window.gridRedraw) window.gridRedraw();
}

function updateRoomInfoPanel() {
    const section = document.getElementById("roomPropsSection");
    const info = document.getElementById("selectedRoomInfo");

    if (!State.selectedRoomName || !State.currentLayout) {
        section.style.display = "none";
        return;
    }

    const room = State.currentLayout.rooms.find(r => r.name === State.selectedRoomName);
    if (!room) { section.style.display = "none"; return; }

    section.style.display = "";
    let furniHtml = "";
    if (room.furniture && room.furniture.length > 0) {
        furniHtml = `<div class="room-furniture-list">` +
            room.furniture.map(f =>
                `<div class="rf-item">
           <span>${escHtml(f.name)}</span>
           <button class="rf-remove" title="Remove" onclick="removeFurnitureFromRoom('${escHtml(room.name)}','${f.id}')">✕</button>
         </div>`
            ).join("") +
            `</div>`;
    } else {
        furniHtml = `<p style="font-size:11px;color:var(--text-muted)">No furniture placed yet.</p>`;
    }

    info.innerHTML = `
    <div class="ri-name" style="color:${room.color}">${escHtml(room.name)}</div>
    <div class="ri-size">${room.width}m × ${room.height}m at (${room.x}, ${room.y})</div>
    ${furniHtml}`;
}

/* ─── Add Room Modal ────────────────────────────────────────── */
function openAddRoomModal() {
    document.getElementById("newRoomName").value = "";
    document.getElementById("newRoomW").value = "4";
    document.getElementById("newRoomH").value = "3";
    document.getElementById("newRoomConstraints").value = "";
    openModal("addRoomModal");
    setTimeout(() => document.getElementById("newRoomName").focus(), 100);
}

function addRoom() {
    const name = document.getElementById("newRoomName").value.trim();
    const w = parseFloat(document.getElementById("newRoomW").value);
    const h = parseFloat(document.getElementById("newRoomH").value);
    const raw = document.getElementById("newRoomConstraints").value;
    const constraints = raw.split("\n").map(s => s.trim()).filter(Boolean);

    if (!name) { showToast("Please enter a room name.", "error"); return; }
    if (State.rooms.find(r => r.name === name)) {
        showToast("A room with that name already exists.", "error"); return;
    }
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
        showToast("Room dimensions must be positive numbers.", "error"); return;
    }

    State.rooms.push({ name, width: w, height: h, constraints });
    closeModal("addRoomModal");
    renderRoomList();
    showToast(`Room "${name}" added.`, "success");
}

/* ─── Edit Room Modal ───────────────────────────────────────── */
function openEditRoomModal(name) {
    const room = State.rooms.find(r => r.name === name);
    if (!room) return;
    document.getElementById("editRoomOriginalName").value = name;
    document.getElementById("editRoomName").value = name;
    document.getElementById("editRoomW").value = room.width;
    document.getElementById("editRoomH").value = room.height;
    document.getElementById("editRoomConstraints").value = (room.constraints || []).join("\n");
    openModal("editRoomModal");
}

function saveEditRoom() {
    const origName = document.getElementById("editRoomOriginalName").value;
    const newName = document.getElementById("editRoomName").value.trim();
    const w = parseFloat(document.getElementById("editRoomW").value);
    const h = parseFloat(document.getElementById("editRoomH").value);
    const raw = document.getElementById("editRoomConstraints").value;
    const constraints = raw.split("\n").map(s => s.trim()).filter(Boolean);

    if (!newName) { showToast("Room name cannot be empty.", "error"); return; }
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
        showToast("Dimensions must be positive.", "error"); return;
    }
    if (newName !== origName && State.rooms.find(r => r.name === newName)) {
        showToast("Name already in use.", "error"); return;
    }

    const room = State.rooms.find(r => r.name === origName);
    if (!room) return;
    room.name = newName;
    room.width = w;
    room.height = h;
    room.constraints = constraints;

    if (State.selectedRoomName === origName) State.selectedRoomName = newName;
    closeModal("editRoomModal");
    renderRoomList();
    showToast("Room updated.", "success");
}

function deleteRoomByModal() {
    const origName = document.getElementById("editRoomOriginalName").value;
    State.rooms = State.rooms.filter(r => r.name !== origName);
    if (State.selectedRoomName === origName) State.selectedRoomName = null;
    closeModal("editRoomModal");
    renderRoomList();
    showToast(`Room "${origName}" deleted.`);
}

/* ─── Generate Layout ───────────────────────────────────────── */
async function generateLayout() {
    if (State.rooms.length === 0) {
        showToast("Add at least one room first.", "error");
        return;
    }

    const houseW = parseFloat(document.getElementById("houseWidth").value);
    const houseH = parseFloat(document.getElementById("houseHeight").value);

    if (isNaN(houseW) || houseW <= 0 || isNaN(houseH) || houseH <= 0) {
        showToast("Enter valid house dimensions.", "error");
        return;
    }

    showLoading("Running AI Solver (CSP + Hill Climbing)…");

    try {
        const body = {
            house_width: houseW,
            house_height: houseH,
            rooms: State.rooms.map(r => ({
                name: r.name,
                width: r.width,
                height: r.height,
                constraints: r.constraints || [],
            })),
        };

        const res = await fetch("/generate-layout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { showToast(data.error || "Solver failed.", "error"); hideLoading(); return; }

        // Merge furniture that may exist in current layout
        if (State.currentLayout) {
            data.layout.rooms.forEach(newRoom => {
                const old = State.currentLayout.rooms.find(r => r.name === newRoom.name);
                if (old) newRoom.furniture = old.furniture || [];
            });
        }

        State.currentLayout = data.layout;
        State.layoutGenerated = true;

        // Update room colors from response
        State.currentLayout.rooms.forEach(r => {
            const local = State.rooms.find(lr => lr.name === r.name);
            if (local) local.color = r.color;
        });

        hideLoading();
        showLayoutUI();

        // Display score
        const scoreEl = document.getElementById("scoreValue");
        const hintEl = document.getElementById("scoreHint");
        scoreEl.textContent = data.score.toFixed(1);
        hintEl.textContent = `${data.nodes_expanded} nodes expanded`;
        document.getElementById("scoreDisplay").style.display = "";
        document.getElementById("solverInfo").style.display = "";
        document.getElementById("solverDetails").textContent =
            `CSP: Backtracking + Forward Checking + MRV\nHill Climbing: 3 restarts, 1500 iter.`;
        document.getElementById("btnSave").style.display = "";

        renderRoomList();
        updateColorLegend();
        updateRoomInfoPanel();

        // Render 2D or 3D
        if (State.view === "2d" && window.initGrid) {
            window.initGrid(State.currentLayout);
        } else if (State.view === "3d" && window.initThreeScene) {
            window.initThreeScene(State.currentLayout);
        }

        showToast("Layout generated ✨", "success");
    } catch (err) {
        console.error(err);
        hideLoading();
        showToast("Network error. Is the backend running?", "error");
    }
}

/* ─── Save / Load ───────────────────────────────────────────── */
async function saveLayout() {
    if (!State.currentLayout) { showToast("No layout to save.", "error"); return; }
    try {
        const res = await fetch("/save-layout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layout: State.currentLayout }),
        });
        const data = await res.json();
        if (res.ok) showToast("Layout saved 💾", "success");
        else showToast(data.error || "Save failed.", "error");
    } catch { showToast("Save error.", "error"); }
}

async function loadLayout() {
    try {
        const res = await fetch("/load-layout");
        if (!res.ok) { showToast("No saved layout found.", "error"); return; }
        const data = await res.json();
        State.currentLayout = data.layout;
        State.layoutGenerated = true;
        showLayoutUI();
        if (State.view === "2d" && window.initGrid) window.initGrid(State.currentLayout);
        else if (State.view === "3d" && window.initThreeScene) window.initThreeScene(State.currentLayout);
        renderRoomList();
        updateColorLegend();
        updateRoomInfoPanel();
        document.getElementById("btnSave").style.display = "";
        showToast("Layout loaded 📂", "success");
    } catch { showToast("Load error.", "error"); }
}

/* ─── View Switching ─────────────────────────────────────────────── */
function switchView(v) {
    State.view = v;
    document.getElementById("btn2D").classList.toggle("active", v === "2d");
    document.getElementById("btn3D").classList.toggle("active", v === "3d");

    if (!State.currentLayout) return;

    if (v === "2d") {
        // Dispose 3D scene when leaving it
        if (window.disposeThree) window.disposeThree();
        document.getElementById("canvasWrapper").style.display = "";
        document.getElementById("threeWrapper").style.display = "none";
        if (window.initGrid) window.initGrid(State.currentLayout);
    } else {
        document.getElementById("canvasWrapper").style.display = "none";
        document.getElementById("threeWrapper").style.display = "";
        // Allow one frame for the DOM to lay out the container before WebGL reads size
        setTimeout(() => {
            if (window.initThreeScene) window.initThreeScene(State.currentLayout);
        }, 50);
    }
}

/* ─── Export ────────────────────────────────────────────────── */
function exportJSON() {
    if (!State.currentLayout) { showToast("Nothing to export.", "error"); return; }
    const blob = new Blob([JSON.stringify({ layout: State.currentLayout }, null, 2)],
        { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "house_layout.json"; a.click();
    URL.revokeObjectURL(url);
    showToast("JSON exported.", "success");
}

function exportImage() {
    const canvas = document.getElementById("layoutCanvas");
    if (!canvas || !State.currentLayout) { showToast("Switch to 2D view first.", "error"); return; }
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = "house_layout.png"; a.click();
    showToast("Image exported.", "success");
}

function resetLayout() {
    if (!confirm("Reset layout and clear all rooms?")) return;
    State.currentLayout = null;
    State.layoutGenerated = false;
    State.selectedRoomName = null;
    State.rooms = JSON.parse(JSON.stringify(DEFAULT_ROOMS));
    document.getElementById("emptyState").style.display = "";
    document.getElementById("canvasWrapper").style.display = "none";
    document.getElementById("threeWrapper").style.display = "none";
    document.getElementById("scoreDisplay").style.display = "none";
    document.getElementById("btnSave").style.display = "none";
    document.getElementById("roomPropsSection").style.display = "none";
    if (window.disposeThree) window.disposeThree();
    renderRoomList();
    updateColorLegend();
    showToast("Layout reset.", "success");
}

/* ─── Furniture ─────────────────────────────────────────────── */
function removeFurnitureFromRoom(roomName, furniId) {
    if (!State.currentLayout) return;
    const room = State.currentLayout.rooms.find(r => r.name === roomName);
    if (!room) return;
    room.furniture = room.furniture.filter(f => f.id !== furniId);
    updateRoomInfoPanel();
    if (window.gridRedraw) window.gridRedraw();
    showToast("Furniture removed.");
}

/* ─── UI Helpers ────────────────────────────────────────────── */
function showLayoutUI() {
    document.getElementById("emptyState").style.display = "none";
    if (State.view === "2d") {
        document.getElementById("canvasWrapper").style.display = "";
        document.getElementById("threeWrapper").style.display = "none";
    } else {
        document.getElementById("canvasWrapper").style.display = "none";
        document.getElementById("threeWrapper").style.display = "";
    }
}

function showLoading(msg = "Loading…") {
    const overlay = document.getElementById("loadingOverlay");
    document.getElementById("loadingText").textContent = msg;
    overlay.style.display = "flex";
    document.getElementById("btnGenerate").disabled = true;
}
function hideLoading() {
    document.getElementById("loadingOverlay").style.display = "none";
    document.getElementById("btnGenerate").disabled = false;
}

function openModal(id) {
    document.getElementById(id).style.display = "flex";
}
function closeModal(id) {
    document.getElementById(id).style.display = "none";
}
function closeModalBackdrop(e, id) {
    if (e.target.classList.contains("modal-backdrop")) closeModal(id);
}

let _toastTimer = null;
function showToast(msg, type = "") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast" + (type ? " " + type : "");
    t.classList.add("show");
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

function safeId(name) { return name.replace(/[^a-zA-Z0-9]/g, "_"); }
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Expose to other modules ───────────────────────────────── */
window.State = State;
window.selectRoom = selectRoom;
window.updateRoomInfoPanel = updateRoomInfoPanel;
window.showToast = showToast;
window.generateLayout = generateLayout;
window.saveLayout = saveLayout;
window.loadLayout = loadLayout;
window.switchView = switchView;
window.exportJSON = exportJSON;
window.exportImage = exportImage;
window.resetLayout = resetLayout;
window.openAddRoomModal = openAddRoomModal;
window.addRoom = addRoom;
window.openEditRoomModal = openEditRoomModal;
window.saveEditRoom = saveEditRoom;
window.deleteRoomByModal = deleteRoomByModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalBackdrop = closeModalBackdrop;
window.removeFurnitureFromRoom = removeFurnitureFromRoom;
window.escHtml = escHtml;
window.safeId = safeId;
window.ROOM_COLORS = ROOM_COLORS;
