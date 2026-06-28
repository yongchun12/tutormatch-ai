"""Unit tests for the TutorMatch ranking logic.

Run from the ai-service directory with:  pytest
"""

import math

from app.services.scoring import (
    CentreInput,
    StudentInput,
    distance_score,
    haversine_distance,
    rank_centres,
    score_centre,
    subject_match_score,
    wilson_lower_bound,
)


# --- Haversine distance -------------------------------------------------------

def test_haversine_same_point_is_zero():
    assert haversine_distance(3.0, 101.0, 3.0, 101.0) == 0.0


def test_haversine_known_distance_kl_to_petaling_jaya():
    # KL city centre to Petaling Jaya is roughly 11 km.
    km = haversine_distance(3.1390, 101.6869, 3.1073, 101.6067)
    assert 8 < km < 14


# --- Distance score -----------------------------------------------------------

def test_distance_score_decays_with_distance():
    assert distance_score(0, 20) == 1.0
    assert distance_score(10, 20) == 0.5
    assert distance_score(20, 20) == 0.0


def test_distance_score_never_negative():
    assert distance_score(100, 20) == 0.0


# --- Subject match ------------------------------------------------------------

def test_subject_match_full_overlap():
    score, matched = subject_match_score(["Physics", "Chemistry"], ["Physics", "Chemistry", "Biology"])
    assert score == 1.0
    assert set(matched) == {"Physics", "Chemistry"}


def test_subject_match_partial_and_case_insensitive():
    score, matched = subject_match_score(["Physics", "Chemistry"], ["physics", "Add Math"])
    assert score == 0.5
    assert matched == ["Physics"]


def test_subject_match_no_subjects_requested():
    score, matched = subject_match_score([], ["Physics"])
    assert score == 0.0
    assert matched == []


# --- Wilson lower bound (reliability-adjusted rating) -------------------------

def test_wilson_zero_reviews_is_zero():
    assert wilson_lower_bound(5.0, 0) == 0.0


def test_wilson_penalises_small_sample():
    # A perfect 5.0 from a single review must score lower than a 4.5 from many.
    one_review = wilson_lower_bound(5.0, 1)
    many_reviews = wilson_lower_bound(4.5, 200)
    assert one_review < many_reviews


def test_wilson_increases_with_more_supporting_reviews():
    few = wilson_lower_bound(4.5, 5)
    many = wilson_lower_bound(4.5, 500)
    assert many > few
    assert 0.0 <= few <= many <= 1.0


# --- End-to-end scoring & ranking --------------------------------------------

def _student():
    return StudentInput(
        subjects_needed=["Physics", "Additional Mathematics"],
        user_lat=3.0738,
        user_lng=101.5183,  # Subang Jaya
        max_distance_km=25.0,
    )


def test_score_centre_produces_reason_and_bounded_score():
    centre = CentreInput(
        centre_id="c1",
        name="Apex Academy",
        city="Petaling Jaya",
        state="Selangor",
        subjects=["Physics", "Additional Mathematics", "Chemistry"],
        average_rating=4.9,
        review_count=40,
        latitude=3.1073,
        longitude=101.6067,
    )
    result = score_centre(centre, _student())
    assert 0.0 <= result.match_score <= 1.0
    assert "subjects" in result.match_reason
    assert "km away" in result.match_reason
    assert result.distance_km is not None


def test_ranking_prefers_better_subject_and_rating_match():
    strong = CentreInput(
        centre_id="strong",
        name="Strong Match",
        subjects=["Physics", "Additional Mathematics"],
        average_rating=4.8,
        review_count=120,
        latitude=3.08,
        longitude=101.52,
    )
    weak = CentreInput(
        centre_id="weak",
        name="Weak Match",
        subjects=["English"],
        average_rating=5.0,
        review_count=1,
        latitude=3.08,
        longitude=101.52,
    )
    ranked = rank_centres([weak, strong], _student())
    assert ranked[0].centre_id == "strong"


def test_ranking_without_coordinates_still_works():
    # Distance signal is dropped; ranking falls back to subject + rating.
    student = StudentInput(subjects_needed=["Physics"])  # no coordinates
    centres = [
        CentreInput(centre_id="a", name="A", subjects=["Physics"], average_rating=4.5, review_count=50),
        CentreInput(centre_id="b", name="B", subjects=["Art"], average_rating=4.5, review_count=50),
    ]
    ranked = rank_centres(centres, student)
    assert ranked[0].centre_id == "a"
    assert all(r.distance_km is None for r in ranked)
