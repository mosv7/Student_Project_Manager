"""
solver/csp_solver.py
---------------------
Core CSP (Constraint Satisfaction Problem) solver for house layout generation.

Implements:
  • Backtracking Search
  • Forward Checking  (AC-1 style domain pruning after each assignment)
  • MRV heuristic     (Minimum Remaining Values variable selection)
  • Degree heuristic  (tie-breaker)
  • LCV ordering      (Least Constraining Value)
  • Constraint Propagation (arc consistency)
"""

from __future__ import annotations

import copy
import logging
from typing import Dict, List, Optional, Tuple

from .constraints import build_constraints, rooms_overlap, room_inside_house
from .heuristics import mrv_select_variable, lcv_order_values

log = logging.getLogger(__name__)

# Grid resolution: we try positions in steps of GRID_STEP metres
GRID_STEP = 1.0


# ---------------------------------------------------------------------------
# Domain builder
# ---------------------------------------------------------------------------

def build_domains(
    room_names: List[str],
    room_sizes: Dict[str, Tuple[float, float]],
    house_w: float,
    house_h: float,
    step: float = GRID_STEP,
) -> Dict[str, List[Tuple[float, float]]]:
    """
    Generate all valid (x, y) grid positions for each room.

    Positions are snapped to a grid of *step* metres and clipped so that
    the room stays fully inside the house.
    """
    domains: Dict[str, List[Tuple[float, float]]] = {}
    for name in room_names:
        w, h = room_sizes[name]
        positions = []
        x = 0.0
        while x + w <= house_w + 1e-9:
            y = 0.0
            while y + h <= house_h + 1e-9:
                positions.append((round(x, 3), round(y, 3)))
                y += step
            x += step
        domains[name] = positions
    return domains


# ---------------------------------------------------------------------------
# Forward Checking  (prune domains after an assignment)
# ---------------------------------------------------------------------------

def forward_check(
    var: str,
    value: Tuple[float, float],
    assignment: Dict[str, Tuple[float, float]],
    domains: Dict[str, List[Tuple[float, float]]],
    room_sizes: Dict[str, Tuple[float, float]],
    hard_constraints: list,
) -> Optional[Dict[str, List[Tuple[float, float]]]]:
    """
    After assigning *value* to *var*, prune all values from unassigned
    neighbours that would violate a hard constraint.

    Returns a pruned copy of *domains*, or None if any domain becomes empty
    (failure detected early).
    """
    new_domains = copy.deepcopy(domains)

    # Test each unassigned variable
    for other in list(new_domains.keys()):
        if other == var or other in assignment:
            continue

        surviving = []
        for val in new_domains[other]:
            test_assignment = dict(assignment)
            test_assignment[var] = value
            test_assignment[other] = val

            violated = False
            for c in hard_constraints:
                r1 = getattr(c, "room1", None)
                r2 = getattr(c, "room2", None)
                is_soft = getattr(c, "is_soft", False)
                if is_soft:
                    continue
                # Only evaluate constraints that involve both assigned vars
                if (r1 == other or r2 == other) and (r1 == var or r2 == var or
                        r1 in test_assignment or r2 in test_assignment):
                    if not c(test_assignment, room_sizes):
                        violated = True
                        break
            if not violated:
                surviving.append(val)

        if not surviving:
            return None  # domain wipe-out
        new_domains[other] = surviving

    return new_domains


# ---------------------------------------------------------------------------
# Constraint propagation (AC-3)
# ---------------------------------------------------------------------------

def ac3(
    domains: Dict[str, List[Tuple[float, float]]],
    room_sizes: Dict[str, Tuple[float, float]],
    hard_constraints: list,
    assignment: Dict[str, Tuple[float, float]],
) -> Optional[Dict[str, List[Tuple[float, float]]]]:
    """
    Run AC-3 arc consistency to propagate constraints and prune domains.
    Returns pruned domains or None on failure.
    """
    new_domains = copy.deepcopy(domains)
    # Build queue of all arcs (pairs related by a constraint)
    queue = set()
    for c in hard_constraints:
        r1 = getattr(c, "room1", None)
        r2 = getattr(c, "room2", None)
        if r1 and r2 and r1 not in assignment and r2 not in assignment:
            queue.add((r1, r2))
            queue.add((r2, r1))
        elif r1 and r2 is None and r1 not in assignment:
            queue.add((r1, r1))

    while queue:
        xi, xj = queue.pop()
        if _revise(xi, xj, new_domains, room_sizes, hard_constraints, assignment):
            if not new_domains[xi]:
                return None
            for c in hard_constraints:
                r1 = getattr(c, "room1", None)
                r2 = getattr(c, "room2", None)
                if r2 == xi and r1 != xj and r1 not in assignment:
                    queue.add((r1, xi))

    return new_domains


def _revise(
    xi: str,
    xj: str,
    domains: Dict[str, List[Tuple[float, float]]],
    room_sizes: Dict[str, Tuple[float, float]],
    hard_constraints: list,
    assignment: Dict[str, Tuple[float, float]],
) -> bool:
    """Remove values from domain of xi that have no support in xj."""
    revised = False
    to_remove = []
    for vi in domains[xi]:
        has_support = False
        test_i = dict(assignment)
        test_i[xi] = vi
        for vj in (domains[xj] if xj != xi else [vi]):
            test_ij = dict(test_i)
            test_ij[xj] = vj
            ok = True
            for c in hard_constraints:
                r1 = getattr(c, "room1", None)
                r2 = getattr(c, "room2", None)
                is_soft = getattr(c, "is_soft", False)
                if is_soft:
                    continue
                if xi in (r1, r2) and (xj in (r1, r2) or xj == xi):
                    if not c(test_ij, room_sizes):
                        ok = False
                        break
            if ok:
                has_support = True
                break
        if not has_support:
            to_remove.append(vi)
            revised = True
    for v in to_remove:
        domains[xi].remove(v)
    return revised


# ---------------------------------------------------------------------------
# Backtracking Search
# ---------------------------------------------------------------------------

class CSPSolver:
    """
    Constraint Satisfaction Problem solver for house room layout.

    Usage
    -----
    solver = CSPSolver(house_w, house_h, rooms, adjacency_pairs)
    assignment = solver.solve()
    """

    def __init__(
        self,
        house_w: float,
        house_h: float,
        rooms: List[dict],          # [{"name":…,"width":…,"height":…}]
        adjacency_pairs: List[Tuple[str, str]],
        grid_step: float = GRID_STEP,
        max_nodes: int = 50_000,
    ):
        self.house_w = house_w
        self.house_h = house_h
        self.grid_step = grid_step
        self.max_nodes = max_nodes

        self.room_names: List[str] = [r["name"] for r in rooms]
        self.room_sizes: Dict[str, Tuple[float, float]] = {
            r["name"]: (float(r["width"]), float(r["height"])) for r in rooms
        }
        self.adjacency_pairs = adjacency_pairs

        # Build constraint list
        self.constraints = build_constraints(
            self.room_names,
            self.room_sizes,
            house_w,
            house_h,
            adjacency_pairs,
        )

        # Separate hard vs soft
        self.hard_constraints = [c for c in self.constraints
                                  if not getattr(c, "is_soft", False)]
        self.soft_constraints = [c for c in self.constraints
                                 if getattr(c, "is_soft", False)]

        # Initial domains
        self.initial_domains = build_domains(
            self.room_names, self.room_sizes, house_w, house_h, grid_step
        )

        self._nodes_expanded = 0

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def solve(self) -> Optional[Dict[str, Tuple[float, float]]]:
        """
        Run backtracking search with forward checking and MRV.

        Returns
        -------
        dict {room_name: (x, y)} on success, or None if unsolvable.
        """
        # Run initial AC-3
        domains = ac3(
            self.initial_domains,
            self.room_sizes,
            self.hard_constraints,
            {},
        )
        if domains is None:
            log.warning("AC-3 initial propagation failed — problem unsolvable.")
            return None

        self._nodes_expanded = 0
        result = self._backtrack({}, domains)
        log.info("Nodes expanded: %d", self._nodes_expanded)
        return result

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _is_consistent(
        self,
        var: str,
        value: Tuple[float, float],
        assignment: Dict[str, Tuple[float, float]],
    ) -> bool:
        """Check all hard constraints involving *var* against *assignment*."""
        test = dict(assignment)
        test[var] = value
        for c in self.hard_constraints:
            r1 = getattr(c, "room1", None)
            r2 = getattr(c, "room2", None)
            if var in (r1, r2):
                if not c(test, self.room_sizes):
                    return False
        return True

    def _backtrack(
        self,
        assignment: Dict[str, Tuple[float, float]],
        domains: Dict[str, List[Tuple[float, float]]],
    ) -> Optional[Dict[str, Tuple[float, float]]]:
        """Recursive backtracking with Forward Checking and MRV."""

        if len(assignment) == len(self.room_names):
            return assignment  # complete assignment found ✓

        if self._nodes_expanded >= self.max_nodes:
            log.warning("Node limit reached — returning best partial solution.")
            return None

        # MRV variable selection
        unassigned = [v for v in self.room_names if v not in assignment]
        var = mrv_select_variable(
            unassigned, domains,
            self.hard_constraints, assignment, self.room_sizes,
        )

        # LCV value ordering
        ordered_values = lcv_order_values(
            var, domains[var], self.hard_constraints,
            assignment, domains, self.room_sizes, unassigned,
        )

        for value in ordered_values:
            self._nodes_expanded += 1

            if not self._is_consistent(var, value, assignment):
                continue

            # Forward check
            new_domains = forward_check(
                var, value, assignment, domains,
                self.room_sizes, self.hard_constraints,
            )
            if new_domains is None:
                continue  # domain wipe-out — prune branch

            assignment[var] = value
            result = self._backtrack(assignment, new_domains)
            if result is not None:
                return result

            del assignment[var]  # backtrack

        return None  # failure

    @property
    def nodes_expanded(self) -> int:
        return self._nodes_expanded
