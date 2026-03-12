"""
solver/constraints.py
---------------------
Constraint definitions for the CSP House Layout Solver.

Each constraint is a callable that takes two room assignments (room, x, y)
and returns True if the constraint is satisfied.
"""

from typing import List, Tuple, Dict, Any
import math


# ---------------------------------------------------------------------------
# Low-level geometry helpers
# ---------------------------------------------------------------------------

def rooms_overlap(x1: float, y1: float, w1: float, h1: float,
                  x2: float, y2: float, w2: float, h2: float) -> bool:
    """Return True if two rectangles overlap (strict)."""
    return not (x1 + w1 <= x2 or x2 + w2 <= x1 or
                y1 + h1 <= y2 or y2 + h2 <= y1)


def rooms_adjacent(x1: float, y1: float, w1: float, h1: float,
                   x2: float, y2: float, w2: float, h2: float,
                   tolerance: float = 1.0) -> bool:
    """Return True if two rooms share a wall (within *tolerance* meters)."""
    # Check horizontal adjacency
    h_adj = (abs(x1 + w1 - x2) <= tolerance or abs(x2 + w2 - x1) <= tolerance)
    v_overlap = not (y1 + h1 <= y2 or y2 + h2 <= y1)

    # Check vertical adjacency
    v_adj = (abs(y1 + h1 - y2) <= tolerance or abs(y2 + h2 - y1) <= tolerance)
    h_overlap = not (x1 + w1 <= x2 or x2 + w2 <= x1)

    return (h_adj and v_overlap) or (v_adj and h_overlap)


def rooms_distance(x1: float, y1: float, w1: float, h1: float,
                   x2: float, y2: float, w2: float, h2: float) -> float:
    """Manhattan distance between the centres of two rooms."""
    cx1, cy1 = x1 + w1 / 2, y1 + h1 / 2
    cx2, cy2 = x2 + w2 / 2, y2 + h2 / 2
    return abs(cx1 - cx2) + abs(cy1 - cy2)


def room_inside_house(x: float, y: float, w: float, h: float,
                      house_w: float, house_h: float) -> bool:
    """Return True if the room fits entirely within the house boundary."""
    return (x >= 0 and y >= 0 and
            x + w <= house_w and
            y + h <= house_h)


# ---------------------------------------------------------------------------
# Constraint factory functions (return True = constraint satisfied)
# ---------------------------------------------------------------------------

def no_overlap_constraint(room1_key: str, room2_key: str):
    """Binary constraint: the two rooms must not overlap."""
    def check(assignment: Dict[str, Tuple[float, float]],
              room_sizes: Dict[str, Tuple[float, float]]) -> bool:
        if room1_key not in assignment or room2_key not in assignment:
            return True  # not yet assigned → no violation
        x1, y1 = assignment[room1_key]
        x2, y2 = assignment[room2_key]
        w1, h1 = room_sizes[room1_key]
        w2, h2 = room_sizes[room2_key]
        return not rooms_overlap(x1, y1, w1, h1, x2, y2, w2, h2)
    check.__name__ = f"no_overlap({room1_key},{room2_key})"
    check.room1 = room1_key
    check.room2 = room2_key
    return check


def adjacency_constraint(room1_key: str, room2_key: str, tolerance: float = 1.0):
    """Soft preference: two rooms should be adjacent. Used in scoring."""
    def check(assignment: Dict[str, Tuple[float, float]],
              room_sizes: Dict[str, Tuple[float, float]]) -> bool:
        if room1_key not in assignment or room2_key not in assignment:
            return True
        x1, y1 = assignment[room1_key]
        x2, y2 = assignment[room2_key]
        w1, h1 = room_sizes[room1_key]
        w2, h2 = room_sizes[room2_key]
        return rooms_adjacent(x1, y1, w1, h1, x2, y2, w2, h2, tolerance)
    check.__name__ = f"adjacent({room1_key},{room2_key})"
    check.room1 = room1_key
    check.room2 = room2_key
    check.is_soft = True
    return check


def inside_house_constraint(room_key: str, house_w: float, house_h: float):
    """Unary constraint: the room must fit within house boundaries."""
    def check(assignment: Dict[str, Tuple[float, float]],
              room_sizes: Dict[str, Tuple[float, float]]) -> bool:
        if room_key not in assignment:
            return True
        x, y = assignment[room_key]
        w, h = room_sizes[room_key]
        return room_inside_house(x, y, w, h, house_w, house_h)
    check.__name__ = f"inside_house({room_key})"
    check.room1 = room_key
    check.room2 = None
    return check


# ---------------------------------------------------------------------------
# Constraint set builder
# ---------------------------------------------------------------------------

def build_constraints(room_names: List[str],
                      room_sizes: Dict[str, Tuple[float, float]],
                      house_w: float,
                      house_h: float,
                      adjacency_pairs: List[Tuple[str, str]]) -> list:
    """
    Build the full constraint list for the CSP solver.

    Parameters
    ----------
    room_names       : list of room name strings
    room_sizes       : dict mapping name -> (width, height)
    house_w, house_h : house dimensions
    adjacency_pairs  : list of (roomA, roomB) soft-adjacency preferences

    Returns
    -------
    List of constraint callables.
    """
    constraints = []

    # Boundary constraints (unary)
    for name in room_names:
        constraints.append(inside_house_constraint(name, house_w, house_h))

    # No-overlap constraints (binary, all pairs)
    for i in range(len(room_names)):
        for j in range(i + 1, len(room_names)):
            constraints.append(
                no_overlap_constraint(room_names[i], room_names[j])
            )

    # Adjacency preferences (soft — checked separately for scoring)
    for r1, r2 in adjacency_pairs:
        if r1 in room_names and r2 in room_names:
            constraints.append(adjacency_constraint(r1, r2))

    return constraints
