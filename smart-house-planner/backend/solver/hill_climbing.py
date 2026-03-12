"""
solver/hill_climbing.py
-----------------------
Hill-climbing optimizer applied after the CSP solver finds an initial layout.

Scoring function
----------------
  score(layout) considers:
    1. Adjacency bonus   — preferred room pairs that share a wall
    2. Corridor penalty  — sum of Manhattan distances between preferred pairs
    3. Balance score     — how evenly rooms fill the house footprint
    4. Coverage score    — total room area vs house area (higher is better)

The hill-climber performs random position swaps / nudges and keeps
improvements (steepest-ascent variant with random restarts).
"""

from __future__ import annotations

import copy
import math
import random
import logging
from typing import Dict, List, Optional, Tuple

from .constraints import (
    rooms_overlap,
    rooms_adjacent,
    rooms_distance,
    room_inside_house,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_layout(
    assignment: Dict[str, Tuple[float, float]],
    room_sizes: Dict[str, Tuple[float, float]],
    house_w: float,
    house_h: float,
    adjacency_pairs: List[Tuple[str, str]],
) -> float:
    """
    Compute a scalar score for a layout.  Higher is better.

    Components
    ----------
    adjacency_bonus  : +20 per preferred pair that is actually adjacent
    corridor_penalty : -distance  for each preferred pair
    overlap_penalty  : -1000 for each overlapping pair (should not happen
                       after CSP but guarded against here)
    coverage_bonus   : ratio of total room area to house area * 50
    """
    score = 0.0
    names = list(assignment.keys())

    # Pre-compute coverage
    total_room_area = sum(w * h for w, h in room_sizes.values())
    house_area = house_w * house_h
    score += (total_room_area / house_area) * 50.0

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            x1, y1 = assignment[n1]
            x2, y2 = assignment[n2]
            w1, h1 = room_sizes[n1]
            w2, h2 = room_sizes[n2]

            # Overlap penalty
            if rooms_overlap(x1, y1, w1, h1, x2, y2, w2, h2):
                score -= 1000.0

    # Adjacency scoring
    for r1, r2 in adjacency_pairs:
        if r1 not in assignment or r2 not in assignment:
            continue
        x1, y1 = assignment[r1]
        x2, y2 = assignment[r2]
        w1, h1 = room_sizes[r1]
        w2, h2 = room_sizes[r2]

        dist = rooms_distance(x1, y1, w1, h1, x2, y2, w2, h2)
        score -= dist * 2.0  # corridor penalty

        if rooms_adjacent(x1, y1, w1, h1, x2, y2, w2, h2, tolerance=0.5):
            score += 20.0  # adjacency bonus

    return round(score, 3)


# ---------------------------------------------------------------------------
# Validity check
# ---------------------------------------------------------------------------

def is_valid_layout(
    assignment: Dict[str, Tuple[float, float]],
    room_sizes: Dict[str, Tuple[float, float]],
    house_w: float,
    house_h: float,
) -> bool:
    """Return True if layout satisfies all hard constraints."""
    names = list(assignment.keys())

    for name in names:
        x, y = assignment[name]
        w, h = room_sizes[name]
        if not room_inside_house(x, y, w, h, house_w, house_h):
            return False

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            x1, y1 = assignment[n1]
            x2, y2 = assignment[n2]
            w1, h1 = room_sizes[n1]
            w2, h2 = room_sizes[n2]
            if rooms_overlap(x1, y1, w1, h1, x2, y2, w2, h2):
                return False

    return True


# ---------------------------------------------------------------------------
# Hill Climbing optimiser
# ---------------------------------------------------------------------------

def hill_climb(
    assignment: Dict[str, Tuple[float, float]],
    room_sizes: Dict[str, Tuple[float, float]],
    house_w: float,
    house_h: float,
    adjacency_pairs: List[Tuple[str, str]],
    max_iterations: int = 2000,
    grid_step: float = 1.0,
    random_restarts: int = 3,
    seed: Optional[int] = 42,
) -> Tuple[Dict[str, Tuple[float, float]], float]:
    """
    Improve *assignment* using hill climbing.

    On each iteration, randomly pick a room and nudge it to a neighbouring
    grid cell.  Accept the move only if it improves the score AND keeps the
    layout valid.

    Parameters
    ----------
    assignment      : initial layout from CSP solver
    room_sizes      : {name: (w, h)}
    house_w/house_h : house dimensions
    adjacency_pairs : preferred adjacent room pairs
    max_iterations  : iterations per restart
    grid_step       : movement granularity (metres)
    random_restarts : number of attempts from different random perturbations
    seed            : random seed for reproducibility

    Returns
    -------
    (best_assignment, best_score)
    """
    if seed is not None:
        random.seed(seed)

    names = list(assignment.keys())
    moves = [
        (grid_step, 0), (-grid_step, 0),
        (0, grid_step), (0, -grid_step),
    ]

    best = copy.deepcopy(assignment)
    best_score = score_layout(best, room_sizes, house_w, house_h, adjacency_pairs)

    for restart in range(random_restarts):
        current = copy.deepcopy(best)
        current_score = best_score

        # Random perturbation for non-first restarts
        if restart > 0:
            for name in names:
                dx = random.choice([-2, -1, 0, 1, 2]) * grid_step
                dy = random.choice([-2, -1, 0, 1, 2]) * grid_step
                cx, cy = current[name]
                nx, ny = cx + dx, cy + dy
                candidate = dict(current)
                candidate[name] = (nx, ny)
                if is_valid_layout(candidate, room_sizes, house_w, house_h):
                    current = candidate
            current_score = score_layout(current, room_sizes, house_w, house_h, adjacency_pairs)

        for _ in range(max_iterations):
            # Pick a random room
            name = random.choice(names)
            dx, dy = random.choice(moves)
            cx, cy = current[name]
            nx, ny = round(cx + dx, 3), round(cy + dy, 3)

            candidate = dict(current)
            candidate[name] = (nx, ny)

            if not is_valid_layout(candidate, room_sizes, house_w, house_h):
                continue

            new_score = score_layout(
                candidate, room_sizes, house_w, house_h, adjacency_pairs
            )
            if new_score > current_score:
                current = candidate
                current_score = new_score

        if current_score > best_score:
            best = current
            best_score = current_score
            log.info("HC restart %d: improved score to %.2f", restart, best_score)

    log.info("Hill climbing final score: %.2f", best_score)
    return best, best_score
