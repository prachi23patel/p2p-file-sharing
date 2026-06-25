from fastapi import APIRouter , Depends , HTTPException , status
from sqlalchemy.orm import Session
from datetime import datetime
import secrets
from app.database import get_db
from app.models.users import User
from app.models.rooms import Rooms
from app.models.room_participants import User_Rooms
from app.schemas.rooms import CreateRoom , JoinRoom , CreateRoomResponse , JoinRoomResponse , RoomDetails
from app.utils.hashing import hash_password , verify_password
from app.routers.users import get_current_user
from app.routers.connection_manager import ConnectionManager

router = APIRouter(prefix="/rooms", tags=["rooms"])
 
@router.get("/generateRoomId")
def generate_room_id(db : Session = Depends(get_db)):
    while True:
        room_id = secrets.token_hex(4).upper()
        print(room_id)
        room = db.query(Rooms).filter(
            Rooms.room_id == room_id
        ).first()

        if room is None:
            return {
                "room_id" :room_id 
            }
        
@router.post("/create" )
def create(room : CreateRoom , db : Session = Depends(get_db) , owner : User = Depends(get_current_user)):
    # roomid = generate_room_id(db)
    new_room = Rooms(
        room_id = room.room_id,
        room_name = room.room_name,
        owner_id = owner.id,
        room_password = room.password
    )
    db.add(new_room)
    db.commit()
    new_user_room = User_Rooms(
        user_id = owner.id,
        room_id = room.room_id,
        isowner = True
    )
    db.add(new_user_room)
    
    db.commit()
    db.refresh(new_room)
    return {
        "user_id" : owner.id
    }

@router.post("/join" )
def create(room : JoinRoom , db : Session = Depends(get_db) , user : User = Depends(get_current_user)):
    # check if room_id exists or not
    print("Incoming:", room.room_id)
    room_found = db.query(Rooms).filter(
        Rooms.room_id == room.room_id
    ).first()

    if room_found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    already_exists = db.query(User_Rooms).filter(
        User_Rooms.room_id == room.room_id,
        User_Rooms.user_id == user.id
    ).first()
    if not already_exists:
        print("new")
        new_user_room = User_Rooms(
            user_id = user.id,
            room_id = room.room_id,
            isowner = False
        )
        db.add(new_user_room)
        db.commit()
        db.refresh(new_user_room)
    return {
        "user_id" : user.id
    }

@router.post("/leave")
def create(room : RoomDetails , db : Session = Depends(get_db) , user : User = Depends(get_current_user)):
    room_found = db.query(Rooms).filter(Rooms.room_id == room.room_id).first()

    if not room_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    participant = db.query(User_Rooms).filter(
        User_Rooms.room_id == room.room_id,
        User_Rooms.user_id == user.id
    ).first()

    if participant:
        db.delete(participant)
        db.commit()

        # if all members of room leaved then delete room
        participants = db.query(User_Rooms).filter(
            User_Rooms.room_id == room.room_id
        ).all()
        if not participants:
            participants_room = db.query(Rooms).filter(
                Rooms.room_id == room.room_id
            ).first()
            if participants_room:
                db.delete(participants_room)
                db.commit()
        else: 
             return{ 
                 "msg" : "there is participant in room"
             }   
        return {
            "msg" : "user removed"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found"
        )

