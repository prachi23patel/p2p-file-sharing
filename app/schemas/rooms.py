from pydantic import BaseModel , EmailStr , ConfigDict , Field 
from uuid import UUID

class CreateRoom(BaseModel):
    room_name : str
    room_id : str
    password : str

class CreateRoomResponse(BaseModel):
    room_name : str
    room_id : str

class JoinRoom(BaseModel):
    room_id : str
    password : str

class JoinRoomResponse(BaseModel):
    room_id : str
    room_password : str

class RoomDetails(BaseModel):
    room_id : str