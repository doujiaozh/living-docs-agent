"""Math toolkit.

A sample Python module used to exercise living-docs-agent's Python parser.
It covers module docstrings, reST and Google docstrings, decorators, type
hints, default values, varargs and return-type inference.
"""

from typing import Optional


def add(a: int, b: int) -> int:
    """Sum two integers.

    :param a: first operand
    :param b: second operand
    :return: the arithmetic sum of a and b
    """
    return a + b


def greet(name: str, excited: bool = False) -> str:
    """Build a friendly greeting.

    Args:
        name (str): who to greet
        excited (bool): add an exclamation mark when True
    Returns:
        str: the greeting message
    """
    punctuation = "!" if excited else "."
    return f"Hello, {name}{punctuation}"


def describe(
    value: float,
    prefix: Optional[str] = None,
    *,
    precision: int = 2,
    **kwargs,
) -> str:
    """Format a number as a human-readable string."""
    return f"{prefix or ''}{value:.{precision}f}"


async def fetch(url: str, timeout: float = 5.0) -> dict:
    """Fetch a resource asynchronously.

    :param url: location to fetch
    :param timeout: seconds to wait
    :return: parsed payload
    """
    return {"url": url}


# A purely comment-documented function (no docstring).
# The parser should pick up these leading comment lines instead.
def multiply(x: int, y: int):
    return x * y


def variadic_join(*parts: str, separator: str = ", ") -> str:
    """Join many parts with a separator."""
    return separator.join(parts)


class Vector2D:
    """A 2-dimensional vector with basic algebra."""

    def __init__(self, x: float, y: float):
        """Initialize from coordinates.

        :param x: horizontal component
        :param y: vertical component
        """
        self.x = x
        self.y = y

    def magnitude(self) -> float:
        """Euclidean length."""
        return (self.x ** 2 + self.y ** 2) ** 0.5

    @property
    def is_zero(self) -> bool:
        """True when the vector is the null vector."""
        return self.x == 0 and self.y == 0

    @classmethod
    def origin(cls) -> "Vector2D":
        """Create the (0, 0) vector."""
        return cls(0, 0)

    @staticmethod
    def distance(a: "Vector2D", b: "Vector2D") -> float:
        """Distance between two vectors.

        :param a: first vector
        :param b: second vector
        :return: euclidean distance
        """
        return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def inferred_int():
    """Return type is inferred from the return statements."""
    return 42


def inferred_none():
    return
