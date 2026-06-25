from sqlalchemy import Column , String , Integer , TIMESTAMP , Boolean ,  DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base
from sqlalchemy.orm import relationship
from datetime import datetime , timezone

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True , default=uuid.uuid4())
    username = Column(String , unique=True , nullable=False)
    email = Column(String , unique=True ,nullable=False)
    user_password = Column(String , nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    