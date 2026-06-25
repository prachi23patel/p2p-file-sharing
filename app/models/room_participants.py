from sqlalchemy import Column , String , Integer , TIMESTAMP , Boolean ,  DateTime , ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base
from sqlalchemy.orm import relationship
from datetime import datetime , timezone

class User_Rooms(Base):
    __tablename__ = "Room_Participant"

    user_id = Column(UUID(as_uuid=True),ForeignKey("users.id"), primary_key=True,  nullable=False)
    room_id = Column( String,ForeignKey("Rooms.room_id"),primary_key=True ,nullable=False)
    isowner = Column(Boolean , nullable=False)
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_active = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    