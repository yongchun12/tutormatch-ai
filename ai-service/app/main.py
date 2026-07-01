from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sentiment, recommend

app = FastAPI(
    title="Tuition Centre AI Service",
    description="Machine Learning Microservice for Sentiment Analysis and Recommendation Generation",
    version="1.0.0"
)

# Configure CORS so Next.js frontend/backend can access it
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the ML routers
app.include_router(sentiment.router)
app.include_router(recommend.router)

@app.get("/")
def read_root():
    return {"message": "AI Microservice is running. Head to /docs for the API schema."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
