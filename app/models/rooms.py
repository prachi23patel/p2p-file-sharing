from sqlalchemy import Column , String , Integer , TIMESTAMP , Boolean ,  DateTime 
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base
from sqlalchemy.orm import relationship
from datetime import datetime , timezone

class Rooms(Base):
    __tablename__ = "Rooms"

    room_id = Column(String, primary_key=True)
    room_name = Column(String , nullable=False)
    owner_id = Column(UUID(as_uuid=True) , nullable=False)
    room_password = Column(String , nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default = True)