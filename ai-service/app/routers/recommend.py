from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional

from app.services.scoring import (
    CentreInput,
    StudentInput,
    rank_centres,
)

router = APIRouter(
    prefix="/recommend",
    tags=["Recommendations"]
)


class StudentProfile(BaseModel):
    user_id: str
    subjects_needed: List[str] = []
    # Optional location for distance-based scoring. When omitted, distance is
    # simply dropped from the weighted score for every centre.
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    max_distance_km: float = 20.0


class CandidateCentre(BaseModel):
    centre_id: str
    name: str
    city: str = ""
    state: str = ""
    subjects: List[str] = []
    average_rating: float = 0.0
    review_count: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class RecommendationRequest(BaseModel):
    profile: StudentProfile
    centres: List[CandidateCentre]
    # Tunable weights for the subject / rating / distance signals. Defaults are
    # applied by the scoring layer when omitted.
    weights: Optional[dict] = None
    limit: int = Field(default=10, ge=1, le=50)


class RecommendationResponse(BaseModel):
    centre_id: str
    name: str
    location: str
    match_score: float
    match_reason: str
    subject_score: float
    rating_score: float
    distance_score: Optional[float] = None
    distance_km: Optional[float] = None


@router.post("/", response_model=List[RecommendationResponse])
def get_recommendations(request: RecommendationRequest):
    """
    Generate explainable, content-based tuition centre recommendations.

    Candidate centres are supplied by the web backend (which owns the
    database). Each centre is scored on subject match, reliability-adjusted
    rating quality (Wilson lower bound), and distance, then combined with a
    tunable weighted model and returned ranked best-match first with a
    human-readable reason for transparency.
    """
    student = StudentInput(
        subjects_needed=request.profile.subjects_needed,
        user_lat=request.profile.user_lat,
        user_lng=request.profile.user_lng,
        max_distance_km=request.profile.max_distance_km,
    )

    candidates = [
        CentreInput(
            centre_id=c.centre_id,
            name=c.name,
            city=c.city,
            state=c.state,
            subjects=c.subjects,
            average_rating=c.average_rating,
            review_count=c.review_count,
            latitude=c.latitude,
            longitude=c.longitude,
        )
        for c in request.centres
    ]

    ranked = rank_centres(
        candidates, student, weights=request.weights, limit=request.limit
    )

    return [RecommendationResponse(**vars(s)) for s in ranked]
