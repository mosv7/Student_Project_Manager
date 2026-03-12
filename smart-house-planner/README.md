# 🏠 Smart House Layout Planner — AI Powered

An intelligent house layout generator using a custom **CSP (Constraint Satisfaction Problem)** solver with **backtracking search**, **forward checking**, **MRV heuristic**, and **hill-climbing optimisation** — built without any external AI libraries.

## Features

| Feature | Description |
|---------|-------------|
| 🤖 AI Solver | CSP backtracking + AC-3 constraint propagation + MRV/LCV heuristics |
| ⛰️ Optimiser | Hill-climbing with random restarts and scoring function |
| 🗺️ 2D Editor | Interactive canvas: drag rooms, snap-to-grid, place furniture |
| 🧊 3D View | Three.js: extruded walls, room floors, furniture boxes, orbit camera |
| 🪑 Furniture | 14 furniture items, click or drag-to-place, collision aware |
| 💾 Persistence | Save/load layout JSON via Flask REST API |
| 📤 Export | Export layout as JSON or canvas PNG image |

## Tech Stack

- **Backend**: Python 3.10+, Flask, Flask-CORS — custom CSP solver, no ML libraries  
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript  
- **3D**: Three.js (CDN) with OrbitControls  

## Project Structure

```
smart-house-planner/
├── backend/
│   ├── app.py                  # Flask REST API
│   ├── requirements.txt
│   ├── models/
│   │   └── room.py             # Room + FurnitureItem dataclasses
│   ├── solver/
│   │   ├── csp_solver.py       # Backtracking + Forward Checking + AC-3
│   │   ├── heuristics.py       # MRV, Degree, LCV heuristics
│   │   ├── constraints.py      # Constraint definitions
│   │   └── hill_climbing.py    # Hill-climbing optimiser + scoring
│   └── utils/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── layout.js           # State, API calls, room CRUD
│       ├── grid.js             # 2D canvas editor
│       ├── furniture.js        # Furniture panel
│       └── three_scene.js      # Three.js 3D visualisation
└── data/
    └── furniture.json          # Furniture catalogue
```

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Run the Backend

```bash
python app.py
```

The Flask server starts on **http://localhost:5000** and also serves the frontend.

### 3. Open the App

Navigate to **http://localhost:5000** in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate-layout` | Run CSP + hill climbing |
| GET | `/furniture-library` | Return furniture catalogue |
| POST | `/save-layout` | Save layout JSON to disk |
| GET | `/load-layout` | Load last saved layout |

## AI Solver Details

The solver implements a textbook CSP approach:

1. **Variables** — each room is a variable  
2. **Domain** — all valid (x, y) grid positions (1m step)  
3. **Hard constraints** — no overlap, stay inside house boundary  
4. **Soft constraints** — room adjacency preferences ("Kitchen near Living Room")  
5. **MRV** selects the room with fewest remaining positions first  
6. **Forward Checking** prunes neighbour domains after each assignment  
7. **AC-3** runs initial constraint propagation before search  
8. **Hill Climbing** improves the initial solution by random nudges, keeping moves that increase the score  

## Scoring Function

```
score = coverage_bonus
      + Σ adjacency_bonus (per preferred pair)
      - Σ corridor_distance_penalty
      - overlap_penalty (should be 0 after CSP)
```
