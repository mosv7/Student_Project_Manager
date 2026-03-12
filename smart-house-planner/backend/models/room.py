"""
models/room.py
--------------
Dataclasses for Room and Furniture objects used throughout the backend.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Room:
    """Represents a room in the house layout."""
    name: str
    width: float           # meters
    height: float          # meters
    x: Optional[float] = None  # grid position (assigned by solver)
    y: Optional[float] = None
    color: Optional[str] = None
    constraints: list = field(default_factory=list)
    furniture: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "x": self.x,
            "y": self.y,
            "color": self.color,
            "constraints": self.constraints,
            "furniture": [f.to_dict() for f in self.furniture],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Room":
        room = cls(
            name=data["name"],
            width=data["width"],
            height=data["height"],
            x=data.get("x"),
            y=data.get("y"),
            color=data.get("color"),
            constraints=data.get("constraints", []),
        )
        room.furniture = [FurnitureItem.from_dict(f) for f in data.get("furniture", [])]
        return room


@dataclass
class FurnitureItem:
    """Represents a piece of furniture placed inside a room."""
    id: str
    name: str
    width: float
    height: float
    x: float = 0.0        # position relative to room origin
    y: float = 0.0
    rotation: int = 0     # degrees: 0 or 90

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "x": self.x,
            "y": self.y,
            "rotation": self.rotation,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "FurnitureItem":
        return cls(
            id=data["id"],
            name=data["name"],
            width=data["width"],
            height=data["height"],
            x=data.get("x", 0.0),
            y=data.get("y", 0.0),
            rotation=data.get("rotation", 0),
        )
