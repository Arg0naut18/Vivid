import os


class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-me-in-prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Optional TURN Server Config (for cross-network P2P)
    TURN_URL: str = os.getenv("TURN_URL", "")
    TURN_API_KEY: str = os.getenv("TURN_API_KEY", "")

    # Optional Metered.ca Config (Dynamic TURN)
    # URL should be: https://vivid.metered.live/api/v1/turn/credentials
    TURN_USERNAME: str = os.getenv("TURN_USERNAME", "")
    TURN_PASSWORD: str = os.getenv("TURN_PASSWORD", "")


settings = Settings()
