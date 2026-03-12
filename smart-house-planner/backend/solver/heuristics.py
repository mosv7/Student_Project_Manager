"""
solver/heuristics.py
--------------------
Heuristics used by the CSP backtracking search:

  • MRV  – Minimum Remaining Values:
        Choose the variable whose domain has the fewest legal values.
        ("most constrained variable" heuristic)

  • Degree heuristic (tie-breaker):
        Among variables with equal MRV count, prefer the one
        involved in the most constraints with unassigned neighbours.

  • LCV  – Least Constraining Value (optional, applied per value):
        Order values so that the one that rules out the fewest
        choices for neighbours is tried first.
"""

from typing import Dict, List, Tuple, Any


# ---------------------------------------------------------------------------
# MRV — Minimum Remaining Values
# ---------------------------------------------------------------------------

def mrv_select_variable(
    unassigned: List[str],
    domains: Dict[str, List[Tuple[float, float]]],
    constraints: list,
    assignment: Dict[str, Tuple[float, float]],
    room_sizes: Dict[str, Tuple[float, float]],
) -> str:
    """
    Select the unassigned variable with the smallest remaining domain.
    Uses Degree heuristic as a tie-breaker.

    Parameters
    ----------
    unassigned  : list of room names not yet assigned
    domains     : current filtered domains for each room
    constraints : list of constraint callables
    assignment  : current partial assignment {room_name: (x, y)}
    room_sizes  : dict {room_name: (width, height)}

    Returns
    -------
    The room name to assign next.
    """
    if not unassigned:
        raise ValueError("No unassigned variables to select from.")

    # Compute domain size for each unassigned variable
    def domain_size(var: str) -> int:
        return len(domains[var])

    # Degree = number of constraints the variable has with *unassigned* neighbours
    def degree(var: str) -> int:
        count = 0
        for c in constraints:
            r1 = getattr(c, "room1", None)
            r2 = getattr(c, "room2", None)
            if var in (r1, r2):
                other = r2 if var == r1 else r1
                if other is not None and other in unassigned and other != var:
                    count += 1
        return count

    # Sort: primary = smallest domain, secondary = largest degree (negative for sort)
    best = sorted(unassigned, key=lambda v: (domain_size(v), -degree(v)))[0]
    return best


# ---------------------------------------------------------------------------
# LCV — Least Constraining Value
# ---------------------------------------------------------------------------

def lcv_order_values(
    var: str,
    domain: List[Tuple[float, float]],
    constraints: list,
    assignment: Dict[str, Tuple[float, float]],
    domains: Dict[str, List[Tuple[float, float]]],
    room_sizes: Dict[str, Tuple[float, float]],
    unassigned: List[str],
) -> List[Tuple[float, float]]:
    """
    Order the values in *domain* for *var* by the LCV heuristic.

    For each candidate value, count how many values it would eliminate
    from the domains of neighbouring unassigned variables.  Values that
    eliminate fewer choices come first.

    Parameters
    ----------
    var        : the variable being assigned
    domain     : list of (x, y) candidate positions
    constraints: list of constraint callables
    assignment : current partial assignment
    domains    : current filtered domains for all variables
    room_sizes : dict {room_name: (width, height)}
    unassigned : list of not-yet-assigned room names

    Returns
    -------
    domain sorted by ascending "constraints eliminated" count
    """
    def count_eliminated(value: Tuple[float, float]) -> int:
        test_assignment = dict(assignment)
        test_assignment[var] = value
        total = 0
        for neighbour in unassigned:
            if neighbour == var:
                continue
            for val in domains[neighbour]:
                test2 = dict(test_assignment)
                test2[neighbour] = val
                for c in constraints:
                    r1 = getattr(c, "room1", None)
                    r2 = getattr(c, "room2", None)
                    if var in (r1, r2) and neighbour in (r1, r2):
                        if not c(test2, room_sizes):
                            total += 1
                            break
        return total

    return sorted(domain, key=count_eliminated)
