/**
 * furniture.js
 * ------------
 * Furniture library panel rendering and drag-and-drop initiation.
 *
 * The actual drop target is handled in grid.js (canvas drop zone).
 * This module:
 *  - Renders furniture item cards in the right panel
 *  - Sets up HTML5 drag start events carrying furniture data
 *  - Provides a floating ghost element while dragging
 */

"use strict";

(function () {

    function renderFurnitureGrid() {
        const grid = document.getElementById("furnitureGrid");
        const library = window.State.furnitureLibrary;
        grid.innerHTML = "";

        library.forEach(item => {
            const card = document.createElement("div");
            card.className = "furniture-item";
            card.draggable = true;
            card.title = `${item.name} (${item.width}×${item.height}m)`;
            card.id = `furni_${item.id}`;
            card.innerHTML = `
        <span class="furniture-icon">${item.icon || "🪑"}</span>
        <span class="furniture-label">${escHtml(item.name)}</span>
        <span class="furniture-size">${item.width}×${item.height}m</span>`;

            // HTML5 drag start — carry JSON payload
            card.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("application/furniture", JSON.stringify(item));
                e.dataTransfer.effectAllowed = "copy";
                showDragGhost(item);
            });
            card.addEventListener("dragend", hideDragGhost);

            // Also allow click-to-place in selected room
            card.addEventListener("click", () => clickPlaceFurniture(item));

            grid.appendChild(card);
        });
    }

    // ─── Click-to-place ──────────────────────────────────
    function clickPlaceFurniture(item) {
        const selectedName = window.State.selectedRoomName;
        if (!selectedName || !window.State.currentLayout) {
            window.showToast("Select a room first, then click furniture.", "error");
            return;
        }
        const room = window.State.currentLayout.rooms.find(r => r.name === selectedName);
        if (!room) return;

        if (!room.furniture) room.furniture = [];

        // Find a free spot inside the room
        let placed = false;
        for (let fy = 0; fy + item.height <= room.height && !placed; fy++) {
            for (let fx = 0; fx + item.width <= room.width && !placed; fx++) {
                if (!furniOverlaps(room, item, fx, fy)) {
                    room.furniture.push({
                        id: item.id + "_" + Date.now(),
                        name: item.name,
                        icon: item.icon,
                        width: item.width,
                        height: item.height,
                        x: fx,
                        y: fy,
                        rotation: 0,
                    });
                    placed = true;
                }
            }
        }

        if (!placed) {
            window.showToast(`Not enough space in ${room.name} for ${item.name}.`, "error");
            return;
        }

        window.showToast(`${item.name} placed in ${room.name}.`, "success");
        if (window.gridRedraw) window.gridRedraw();
        window.updateRoomInfoPanel();
        if (window.State.view === "3d" && window.updateThreeScene) {
            window.updateThreeScene(window.State.currentLayout);
        }
    }

    function furniOverlaps(room, newItem, nx, ny) {
        return (room.furniture || []).some(f => {
            const fw = f.rotation === 90 ? f.height : f.width;
            const fh = f.rotation === 90 ? f.width : f.height;
            return !(nx + newItem.width <= f.x ||
                f.x + fw <= nx ||
                ny + newItem.height <= f.y ||
                f.y + fh <= ny);
        });
    }

    // ─── Ghost element during CSS/HTML5 drag ─────────────
    let ghost = null;

    function showDragGhost(item) {
        hideDragGhost();
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.textContent = `${item.icon || "□"} ${item.name}`;
        document.body.appendChild(ghost);
        document.addEventListener("mousemove", moveDragGhost);
    }

    function moveDragGhost(e) {
        if (!ghost) return;
        ghost.style.left = e.clientX + "px";
        ghost.style.top = e.clientY + "px";
    }

    function hideDragGhost() {
        if (ghost) { ghost.remove(); ghost = null; }
        document.removeEventListener("mousemove", moveDragGhost);
    }

    function escHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ─── Expose ───────────────────────────────────────────
    window.renderFurnitureGrid = renderFurnitureGrid;

    // Re-render whenever furniture library changes
    const origLoad = window.loadFurnitureLibrary;
    // Hook into State via object watch isn't native — call directly from layout.js
    // layout.js already calls renderFurnitureGrid via window.renderFurnitureGrid
})();
