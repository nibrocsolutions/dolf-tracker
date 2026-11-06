from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Dolf"
    data_dir: Path = Path("./data")
    database_url: str | None = None
    host: str = "0.0.0.0"
    port: int = 8092
    seed_demo: bool = True

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.data_dir / 'dolf.db'}"


settings = Settings()
