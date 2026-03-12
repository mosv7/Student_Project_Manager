/**
 * grid.js
 * -------
 * Interactive 2D Canvas editor for the Smart House Layout Planner.
 *
 * Features:
 *  - Renders house grid with room rectangles (colour-coded)
 *  - Drag rooms to new positions (snap to grid)
 *  - Visual wall hatching, grid lines, room labels, dimensions
 *  - Collision detection during drag
 *  - Furniture rectangles inside each room
 *  - Click room to select
 *  - Zoom (+/−/reset)
 *  - Drop furniture from the right panel
 */

"use strict";

(function () {
    const GRID_STEP = 1;   // meters per grid cell
    let CELL_PX = 52;      // pixels per cell (zoomed)
    const CELL_BASE = 52;
    const ZOOM_LEVELS = [26, 36, 44, 52, 64, 80, 96];
    let zoomIdx = 3;       // default = CELL_BASE

    const WALL_W = 3;      // wall border thickness (px)
    const LABEL_FONT = "600 13px 'Inter', sans-serif";
    const DIM_FONT = "11px 'Inter', sans-serif";

    let canvas, ctx;
    let layout = null;

    // Drag state
    let drag = {
        active: false,
        room: null,
        startX: 0, startY: 0,
        origX: 0, origY: 0,
    };

    // ─── Init ────────────────────────────────────────────
    function initGrid(layoutData) {
        layout = layoutData;
        canvas = document.getElementById("layoutCanvas");
        ctx = canvas.getContext("2d");

        const W = layout.house_width;
        const H = layout.house_height;

        resizeCanvas(W, H);
        draw();
        attachEvents();
    }

    function resizeCanvas(W, H) {
        canvas.width = Math.ceil(W * CELL_PX) + WALL_W * 2;
        canvas.height = Math.ceil(H * CELL_PX) + WALL_W * 2;
        canvas.style.width = canvas.width + "px";
        canvas.style.height = canvas.height + "px";
    }

    // ─── Drawing ─────────────────────────────────────────
    function draw() {
        if (!layout || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawHouseBackground();
        drawGrid();
        layout.rooms.forEach(r => drawRoom(r));
        drawHouseBorder();
    }

    function drawHouseBackground() {
        const W = layout.house_width * CELL_PX;
        const H = layout.house_height * CELL_PX;
        const ox = WALL_W, oy = WALL_W;

        // Dark house floor
        ctx.fillStyle = "#1B1E30";
        ctx.fillRect(ox, oy, W, H);
    }

    function drawGrid() {
        const W = layout.house_width;
        const H = layout.house_height;
        const ox = WALL_W, oy = WALL_W;

        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x++) {
            ctx.moveTo(ox + x * CELL_PX, oy);
            ctx.lineTo(ox + x * CELL_PX, oy + H * CELL_PX);
        }
        for (let y = 0; y <= H; y++) {
            ctx.moveTo(ox, oy + y * CELL_PX);
            ctx.lineTo(ox + W * CELL_PX, oy + y * CELL_PX);
        }
        ctx.stroke();
    }

    function drawHouseBorder() {
        const W = layout.house_width * CELL_PX;
        const H = layout.house_height * CELL_PX;
        ctx.strokeStyle = "#6366F180";
        ctx.lineWidth = WALL_W;
        ctx.strokeRect(WALL_W / 2, WALL_W / 2, W + WALL_W, H + WALL_W);
    }

    function drawRoom(room) {
        const ox = WALL_W, oy = WALL_W;
        const rx = ox + room.x * CELL_PX;
        const ry = oy + room.y * CELL_PX;
        const rw = room.width * CELL_PX;
        const rh = room.height * CELL_PX;

        const isSelected = (room.name === window.State.selectedRoomName);
        const isDragging = (drag.active && drag.room && drag.room.name === room.name);

        // Room fill (semi-transparent)
        ctx.save();
        if (isDragging) ctx.globalAlpha = 0.65;

        ctx.fillStyle = room.color + "30";
        ctx.fillRect(rx, ry, rw, rh);

        // Room border
        ctx.strokeStyle = isSelected ? "#fff" : room.color;
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.strokeRect(rx, ry, rw, rh);

        // Selection glow
        if (isSelected) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = room.color;
            ctx.strokeStyle = room.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.shadowBlur = 0;
        }

        ctx.restore();

        // Room name label
        ctx.save();
        ctx.font = LABEL_FONT;
        ctx.fillStyle = room.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelX = rx + rw / 2;
        const labelY = ry + rh / 2 - (rh > 50 ? 10 : 0);

        // Clip to room
        ctx.beginPath();
        ctx.rect(rx + 4, ry + 4, rw - 8, rh - 8);
        ctx.clip();
        ctx.fillText(room.name, labelX, labelY);

        // Dimension label
        if (rw > 60 && rh > 40) {
            ctx.font = DIM_FONT;
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillText(`${room.width}×${room.height}m`, labelX, labelY + 17);
        }
        ctx.restore();

        // Furniture
        if (room.furniture && room.furniture.length > 0) {
            room.furniture.forEach(f => drawFurnitureItem(f, rx, ry, rw, rh));
        }
    }

    function drawFurnitureItem(f, rx, ry, roomW, roomH) {
        const fw = (f.rotation === 90 ? f.height : f.width) * CELL_PX;
        const fh = (f.rotation === 90 ? f.width : f.height) * CELL_PX;
        const fx = rx + f.x * CELL_PX;
        const fy = ry + f.y * CELL_PX;

        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(fx, fy, fw, fh, 4);
        ctx.fill();
        ctx.stroke();

        ctx.font = `${Math.min(fw, fh, 20)}px 'Inter', sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(f.icon || "□", fx + fw / 2, fy + fh / 2);
        ctx.restore();
    }

    // ─── Events ──────────────────────────────────────────
    function attachEvents() {
        // Remove old listeners by cloning canvas
        const old = canvas;
        const nc = old.cloneNode(true);
        old.parentNode.replaceChild(nc, old);
        canvas = nc;
        ctx = canvas.getContext("2d");
        // Re-draw on fresh canvas
        draw();

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("mouseleave", onMouseUp);
        canvas.addEventListener("click", onCanvasClick);

        // Furniture drop target
        canvas.addEventListener("dragover", e => e.preventDefault());
        canvas.addEventListener("drop", onFurnitureDrop);
    }

    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    function gridPos(px, py) {
        return {
            col: (px - WALL_W) / CELL_PX,
            row: (py - WALL_W) / CELL_PX,
        };
    }

    function roomAt(col, row) {
        if (!layout) return null;
        return layout.rooms.find(r =>
            col >= r.x && col < r.x + r.width &&
            row >= r.y && row < r.y + r.height
        ) || null;
    }

    function onCanvasClick(e) {
        if (drag.active) return;
        const { x, y } = canvasPos(e);
        const { col, row } = gridPos(x, y);
        const room = roomAt(col, row);
        if (room) window.selectRoom(room.name);
        else {
            window.State.selectedRoomName = null;
            document.getElementById("roomPropsSection").style.display = "none";
            renderRoomListHighlight();
            draw();
        }
    }

    function onMouseDown(e) {
        if (e.button !== 0) return;
        const { x, y } = canvasPos(e);
        const { col, row } = gridPos(x, y);
        const room = roomAt(col, row);

        if (!room) return;
        drag.active = true;
        drag.room = room;
        drag.startX = x;
        drag.startY = y;
        drag.origX = room.x;
        drag.origY = room.y;
        canvas.style.cursor = "grabbing";
    }

    function onMouseMove(e) {
        if (!drag.active) {
            // Show pointer cursor when over a room
            const { x, y } = canvasPos(e);
            const { col, row } = gridPos(x, y);
            canvas.style.cursor = roomAt(col, row) ? "grab" : "default";
            return;
        }
        const { x, y } = canvasPos(e);
        const dx = x - drag.startX;
        const dy = y - drag.startY;

        // Snap to grid
        let newX = drag.origX + dx / CELL_PX;
        let newY = drag.origY + dy / CELL_PX;
        newX = Math.round(newX);
        newY = Math.round(newY);

        // Clamp to house boundary
        newX = Math.max(0, Math.min(layout.house_width - drag.room.width, newX));
        newY = Math.max(0, Math.min(layout.house_height - drag.room.height, newY));

        // Collision check
        if (!overlapsOtherRoom(drag.room, newX, newY)) {
            drag.room.x = newX;
            drag.room.y = newY;
        }
        draw();
    }

    function onMouseUp() {
        if (drag.active) {
            drag.active = false;
            canvas.style.cursor = "grab";
            // Move any furniture with the room (they are already relative to room)
            window.updateRoomInfoPanel();
        }
    }

    function overlapsOtherRoom(movingRoom, nx, ny) {
        return layout.rooms.some(r => {
            if (r.name === movingRoom.name) return false;
            return !(nx + movingRoom.width <= r.x ||
                r.x + r.width <= nx ||
                ny + movingRoom.height <= r.y ||
                r.y + r.height <= ny);
        });
    }

    // ─── Furniture Drop ───────────────────────────────────
    function onFurnitureDrop(e) {
        e.preventDefault();
        const raw = e.dataTransfer.getData("application/furniture");
        if (!raw) return;
        const furni = JSON.parse(raw);

        const { x, y } = canvasPos(e);
        const { col, row } = gridPos(x, y);
        const room = roomAt(col, row);
        if (!room) { window.showToast("Drop furniture inside a room.", "error"); return; }

        // Relative position within room
        let relX = Math.round(col - room.x);
        let relY = Math.round(row - room.y);
        relX = Math.max(0, Math.min(Math.floor(room.width - furni.width), relX));
        relY = Math.max(0, Math.min(Math.floor(room.height - furni.height), relY));

        if (!room.furniture) room.furniture = [];

        // Generate unique id for this instance
        const uid = furni.id + "_" + Date.now();
        room.furniture.push({
            id: uid,
            name: furni.name,
            icon: furni.icon,
            width: furni.width,
            height: furni.height,
            x: relX,
            y: relY,
            rotation: 0,
        });

        draw();
        window.selectRoom(room.name);
        window.showToast(`${furni.name} placed in ${room.name}.`, "success");

        // Sync 3D if active
        if (window.State.view === "3d" && window.updateThreeScene) {
            window.updateThreeScene(layout);
        }
    }

    // ─── Zoom ─────────────────────────────────────────────
    function zoomIn() {
        if (zoomIdx < ZOOM_LEVELS.length - 1) {
            zoomIdx++; CELL_PX = ZOOM_LEVELS[zoomIdx];
            resizeCanvas(layout.house_width, layout.house_height);
            draw();
        }
    }
    function zoomOut() {
        if (zoomIdx > 0) {
            zoomIdx--; CELL_PX = ZOOM_LEVELS[zoomIdx];
            resizeCanvas(layout.house_width, layout.house_height);
            draw();
        }
    }
    function resetZoom() {
        zoomIdx = 3; CELL_PX = CELL_BASE;
        if (layout) { resizeCanvas(layout.house_width, layout.house_height); draw(); }
    }

    function renderRoomListHighlight() {
        document.querySelectorAll(".room-item").forEach(li => {
            li.classList.remove("selected");
        });
    }

    // ─── Expose ───────────────────────────────────────────
    window.initGrid = initGrid;
    window.gridRedraw = draw;
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetZoom = resetZoom;
})();
