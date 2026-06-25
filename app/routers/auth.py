from fastapi import APIRouter ,Depends , HTTPException , status 
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.users import User
from app.schemas.users import UserCreate , UserLogin , UserResponse
from app.utils.hashing import hash_password , verify_password
from app.utils.jwt import verify_access_token , create_access_token
import uuid

router = APIRouter(prefix="/auth", tags=["Auth"])

def generate_user_id(db):
    while True:
        room_id = uuid.uuid4()

        user = db.query(User).filter(
            User.id == room_id
        ).first()

        if user is None:
            return room_id  

@router.post("/register" , response_model=UserResponse)
def register(user : UserCreate , db : Session = Depends(get_db)):
    existing_useremail = db.query(User).filter(User.email == user.email).first()
    existing_userename = db.query(User).filter(User.username == user.username).first()

    if existing_useremail:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST , detail="user already registered")
    if existing_userename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST , detail="username already taken")    
    new_user = User(
        id = generate_user_id(db),
        username = user.username,
        email = user.email,
        user_password = hash_password(user.password), 
        created_at = datetime.now()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user
    # After commit → database assigns id, created_at automatically
    # db.refresh() → reloads the object with those new values
    # Without refresh → new_user.id will be None

@router.post("/login")
def login(user : UserLogin , db : Session = Depends(get_db)):
    is_email_exists = db.query(User).filter(User.email == user.email).first()
    pwd = None
    id = None
    if is_email_exists:
        pwd = is_email_exists.user_password
        id = is_email_exists.id
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED , detail = "user not found with this username")
    
    if not  verify_password(user.password , pwd):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED , detail = "password doesn't match")
    
    token = create_access_token({"sub" : str(id)})
    # create_access_token already reads SECRET_KEY and ALGORITHM from .env internally , don't need to pass them again here
    # Use "sub" as key → it is JWT standard for subject (user id)
    return {
        "access_token": token,
        "token_type": "bearer"
    }

# Why we separate auth and user routes
# Authentication routes are separated from user routes to maintain separation of concerns. Authentication handles login, registration, and token management, while user routes handle user-related operations. This improves code organization, scalability, and maintainability.