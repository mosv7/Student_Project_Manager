"""
app.py
------
Flask REST API for the Smart House Layout Planner.

Endpoints
---------
  POST /generate-layout      Generate an AI-optimised house layout
  GET  /furniture-library    Return all available furniture items
  POST /save-layout          Persist a layout to disk
  GET  /load-layout          Load the last saved layout
"""

from __future__ import annotations

import json
import logging
import os
import traceback
import random
import colorsys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from solver.csp_solver import CSPSolver
from solver.hill_climbing import hill_climb, score_layout

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"
SAVE_FILE = DATA_DIR / "saved_layout.json"

logging.basicConfig(level=logging.INFO,
                    format="%(levelname)s | %(name)s | %(message)s")
log = logging.getLogger("app")

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Distinct, pleasant room colours (HSL-based)
_BASE_COLORS = [
    "#6366F1",  # indigo
    "#EC4899",  # pink
    "#14B8A6",  # teal
    "#F59E0B",  # amber
    "#8B5CF6",  # violet
    "#10B981",  # emerald
    "#F97316",  # orange
    "#3B82F6",  # blue
    "#EF4444",  # red
    "#84CC16",  # lime
]


def assign_colors(room_names: List[str]) -> Dict[str, str]:
    colors: Dict[str, str] = {}
    for i, name in enumerate(room_names):
        colors[name] = _BASE_COLORS[i % len(_BASE_COLORS)]
    return colors


def parse_adjacency_pairs(rooms: List[dict]) -> List[Tuple[str, str]]:
    """
    Extract adjacency preference pairs from room constraints.
    Constraint strings like "near Living Room" → ("Kitchen", "Living Room")
    """
    pairs: List[Tuple[str, str]] = []
    name_set = {r["name"] for r in rooms}
    for room in rooms:
        for c in room.get("constraints", []):
            cl = c.lower()
            if "near" in cl or "adjacent" in cl or "close" in cl:
                # Find which other room is mentioned
                for target in name_set:
                    if target.lower() in cl and target != room["name"]:
                        pair = tuple(sorted([room["name"], target]))
                        if pair not in pairs:
                            pairs.append(pair)  # type: ignore[arg-type]
    return pairs


def layout_to_response(
    assignment: Dict[str, Tuple[float, float]],
    room_sizes: Dict[str, Tuple[float, float]],
    colors: Dict[str, str],
    constraints_by_room: Dict[str, list],
    score: float,
    nodes_expanded: int,
    house_w: float,
    house_h: float,
) -> dict:
    rooms_out = []
    for name, (x, y) in assignment.items():
        w, h = room_sizes[name]
        rooms_out.append({
            "name": name,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "color": colors.get(name, "#6366F1"),
            "constraints": constraints_by_room.get(name, []),
            "furniture": [],
        })
    return {
        "layout": {
            "house_width": house_w,
            "house_height": house_h,
            "rooms": rooms_out,
        },
        "score": score,
        "nodes_expanded": nodes_expanded,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(str(FRONTEND_DIR), "index.html")


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(str(FRONTEND_DIR), path)


@app.route("/generate-layout", methods=["POST"])
def generate_layout():
    """
    Generate an AI-optimised house layout using CSP + hill climbing.

    Request body
    ------------
    {
      "house_width": 12,
      "house_height": 10,
      "rooms": [
        { "name": "Bedroom",   "width": 4, "height": 4,
          "constraints": ["near Bathroom"] },
        ...
      ]
    }
    """
    try:
        body: dict = request.get_json(force=True)
        house_w = float(body["house_width"])
        house_h = float(body["house_height"])
        rooms: List[dict] = body["rooms"]

        if house_w <= 0 or house_h <= 0:
            return jsonify({"error": "House dimensions must be positive."}), 400
        if not rooms:
            return jsonify({"error": "No rooms provided."}), 400

        # Validate rooms fit in house individually
        for r in rooms:
            if float(r["width"]) > house_w or float(r["height"]) > house_h:
                return jsonify({
                    "error": f"Room '{r['name']}' ({r['width']}×{r['height']}) "
                             f"does not fit in the house ({house_w}×{house_h})."
                }), 400

        adjacency_pairs = parse_adjacency_pairs(rooms)
        room_sizes = {r["name"]: (float(r["width"]), float(r["height"])) for r in rooms}
        constraints_by_room = {r["name"]: r.get("constraints", []) for r in rooms}
        colors = assign_colors([r["name"] for r in rooms])

        log.info("Solving layout for %d rooms in %gx%g house …", len(rooms), house_w, house_h)

        solver = CSPSolver(
            house_w=house_w,
            house_h=house_h,
            rooms=rooms,
            adjacency_pairs=adjacency_pairs,
            grid_step=1.0,
            max_nodes=100_000,
        )
        assignment = solver.solve()

        if assignment is None:
            # Fall back to a greedy placement so the user still gets something
            log.warning("CSP solver exhausted — using greedy fallback.")
            assignment = _greedy_fallback(rooms, house_w, house_h)
            if assignment is None:
                return jsonify({"error": "Could not place all rooms. "
                                         "Try reducing room sizes or increasing house size."}), 422

        # Hill-climbing optimisation
        optimised, final_score = hill_climb(
            assignment, room_sizes, house_w, house_h, adjacency_pairs,
            max_iterations=1500, random_restarts=3,
        )

        return jsonify(layout_to_response(
            optimised, room_sizes, colors, constraints_by_room,
            final_score, solver.nodes_expanded, house_w, house_h,
        ))

    except KeyError as e:
        return jsonify({"error": f"Missing field: {e}"}), 400
    except Exception:                          # noqa: BLE001
        log.error(traceback.format_exc())
        return jsonify({"error": "Internal solver error."}), 500


def _greedy_fallback(
    rooms: List[dict],
    house_w: float,
    house_h: float,
) -> Optional[Dict[str, Tuple[float, float]]]:
    """Pack rooms left-to-right, top-to-bottom as a best-effort fallback."""
    assignment: Dict[str, Tuple[float, float]] = {}
    cursor_x, cursor_y, row_h = 0.0, 0.0, 0.0

    for r in rooms:
        w, h = float(r["width"]), float(r["height"])
        if cursor_x + w > house_w:
            cursor_x = 0.0
            cursor_y += row_h
            row_h = 0.0
        if cursor_y + h > house_h:
            return None  # does not fit
        assignment[r["name"]] = (round(cursor_x, 3), round(cursor_y, 3))
        cursor_x += w
        row_h = max(row_h, h)

    return assignment


@app.route("/furniture-library", methods=["GET"])
def furniture_library():
    """Return the available furniture catalogue."""
    furniture_file = DATA_DIR / "furniture.json"
    with open(furniture_file, encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)


@app.route("/save-layout", methods=["POST"])
def save_layout():
    """Persist the current layout JSON to disk."""
    try:
        body = request.get_json(force=True)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(SAVE_FILE, "w", encoding="utf-8") as f:
            json.dump(body, f, indent=2)
        log.info("Layout saved to %s", SAVE_FILE)
        return jsonify({"status": "ok", "path": str(SAVE_FILE)})
    except Exception:                          # noqa: BLE001
        log.error(traceback.format_exc())
        return jsonify({"error": "Could not save layout."}), 500


@app.route("/load-layout", methods=["GET"])
def load_layout():
    """Load the last saved layout from disk."""
    if not SAVE_FILE.exists():
        return jsonify({"error": "No saved layout found."}), 404
    with open(SAVE_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    log.info("Frontend served from: %s", FRONTEND_DIR)
    app.run(debug=True, host="0.0.0.0", port=5000)
