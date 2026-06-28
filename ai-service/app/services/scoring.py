"""
Core ranking logic for the TutorMatch content-based recommendation engine.

The recommender scores each tuition centre on three explainable signals and
combines them with a tunable weighted model (Score = w_m*M + w_r*R + w_d*D):

    M  Subject match  - graded overlap between the subjects a student needs
                        and the subjects a centre offers.
    R  Rating quality - a reliability-adjusted rating using the Wilson lower
                        bound, so a centre with very few reviews cannot
                        dominate the ranking on a noisy average.
    D  Distance        - great-circle (Haversine) proximity between the
                        student and the centre.

Every function here is pure (no I/O, no framework dependencies) so the ranking
behaviour can be verified directly with unit tests.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# z-score for a 95% confidence interval, used by the Wilson lower bound.
Z_95 = 1.96

# Default weights for the three ranking signals. They sum to 1.0 but the
# combine step re-normalises whenever a signal is unavailable (e.g. a centre
# or student has no coordinates), so the final score always stays in [0, 1].
DEFAULT_WEIGHTS = {"subject": 0.5, "rating": 0.3, "distance": 0.2}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/long points, in kilometres."""
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def distance_score(distance_km: float, max_distance_km: float = 20.0) -> float:
    """Map a distance (km) to a [0, 1] proximity score with linear decay.

    A centre at the student's location scores 1.0; one at or beyond
    ``max_distance_km`` scores 0.0.
    """
    if max_distance_km <= 0:
        return 0.0
    return max(0.0, 1.0 - distance_km / max_distance_km)


def subject_match_score(needed: list[str], offered: list[str]) -> tuple[float, list[str]]:
    """Graded subject overlap in [0, 1] plus the list of matched subjects.

    Score is (matched subjects / requested subjects), so a centre covering
    every subject a student needs scores 1.0. Matching is case-insensitive.
    """
    if not needed:
        return 0.0, []
    offered_lower = {s.strip().lower() for s in offered}
    matched = [s for s in needed if s.strip().lower() in offered_lower]
    return len(matched) / len(needed), matched


def wilson_lower_bound(avg_rating: float, review_count: int, z: float = Z_95) -> float:
    """Reliability-adjusted rating quality in [0, 1].

    The 1-5 star average is converted to a success proportion
    p = (avg_rating - 1) / 4, then the Wilson score interval's lower bound is
    returned. With few reviews the bound sits well below the raw proportion,
    which prevents a 5-star/1-review centre from outranking a well-reviewed
    4.5-star centre. With no reviews the score is 0.0 (no evidence of quality).
    """
    if review_count <= 0:
        return 0.0
    p = max(0.0, min(1.0, (avg_rating - 1.0) / 4.0))
    n = review_count
    denominator = 1 + z**2 / n
    centre = p + z**2 / (2 * n)
    margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n)
    return max(0.0, (centre - margin) / denominator)


@dataclass
class CentreInput:
    """A candidate centre to be scored. Coordinates are optional."""

    centre_id: str
    name: str
    city: str = ""
    state: str = ""
    subjects: list[str] = field(default_factory=list)
    average_rating: float = 0.0
    review_count: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@dataclass
class StudentInput:
    """The student's stated preferences."""

    subjects_needed: list[str] = field(default_factory=list)
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    max_distance_km: float = 20.0


@dataclass
class ScoredCentre:
    centre_id: str
    name: str
    location: str
    match_score: float
    match_reason: str
    subject_score: float
    rating_score: float
    distance_score: Optional[float]
    distance_km: Optional[float]


def score_centre(
    centre: CentreInput,
    student: StudentInput,
    weights: dict[str, float] | None = None,
) -> ScoredCentre:
    """Score one centre and build a human-readable explanation.

    Distance only contributes when both the student and the centre have
    coordinates; otherwise its weight is dropped and the remaining weights are
    re-normalised so the final score stays in [0, 1].
    """
    weights = weights or DEFAULT_WEIGHTS

    subj, matched = subject_match_score(student.subjects_needed, centre.subjects)
    rating = wilson_lower_bound(centre.average_rating, centre.review_count)

    dist_km: Optional[float] = None
    dist_score: Optional[float] = None
    if (
        student.user_lat is not None
        and student.user_lng is not None
        and centre.latitude is not None
        and centre.longitude is not None
    ):
        dist_km = haversine_distance(
            student.user_lat, student.user_lng, centre.latitude, centre.longitude
        )
        dist_score = distance_score(dist_km, student.max_distance_km)

    # Weighted combine with re-normalisation over the signals that apply.
    contributions = [(weights["subject"], subj), (weights["rating"], rating)]
    if dist_score is not None:
        contributions.append((weights["distance"], dist_score))
    total_weight = sum(w for w, _ in contributions) or 1.0
    match_score = sum(w * s for w, s in contributions) / total_weight

    # Build the explanation, ordered by what most justifies the ranking.
    reasons: list[str] = []
    if matched:
        reasons.append(
            f"Matches {len(matched)} of your {len(student.subjects_needed)} "
            f"subjects ({', '.join(matched)})"
        )
    if centre.review_count > 0:
        reasons.append(
            f"{centre.average_rating:.1f}★ from {centre.review_count} reviews"
        )
    if dist_km is not None:
        reasons.append(f"{dist_km:.1f} km away")
    match_reason = " · ".join(reasons) if reasons else "Listed in your area"

    location = ", ".join(part for part in [centre.city, centre.state] if part)

    return ScoredCentre(
        centre_id=centre.centre_id,
        name=centre.name,
        location=location,
        match_score=round(match_score, 4),
        match_reason=match_reason,
        subject_score=round(subj, 4),
        rating_score=round(rating, 4),
        distance_score=round(dist_score, 4) if dist_score is not None else None,
        distance_km=round(dist_km, 2) if dist_km is not None else None,
    )


def rank_centres(
    centres: list[CentreInput],
    student: StudentInput,
    weights: dict[str, float] | None = None,
    limit: int | None = None,
) -> list[ScoredCentre]:
    """Score every candidate and return them sorted best-match first."""
    scored = [score_centre(c, student, weights) for c in centres]
    scored.sort(key=lambda s: s.match_score, reverse=True)
    return scored[:limit] if limit else scored
